begin;
create table app_private.account_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table app_private.account_deletions enable row level security;
revoke all on app_private.account_deletions from public,anon,authenticated;

create or replace function app_private.is_community_member()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null
    and not exists(select 1 from app_private.community_account_status s where s.user_id=u.id and s.status='suspended')
    and not exists(select 1 from app_private.account_deletions d where d.user_id=u.id));
$$;
create or replace function app_private.owns_active_account(target_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select target_user=auth.uid() and exists(select 1 from auth.users u where u.id=auth.uid() and u.deleted_at is null)
    and not exists(select 1 from app_private.account_deletions d where d.user_id=auth.uid());
$$;
create or replace function app_private.can_read_member(target_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_community_member()
    and exists(select 1 from auth.users u where u.id=target_user and u.email_confirmed_at is not null and u.deleted_at is null
      and not exists(select 1 from app_private.community_account_status s where s.user_id=u.id and s.status='suspended')
      and not exists(select 1 from app_private.account_deletions d where d.user_id=u.id))
    and not exists(select 1 from public.member_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=target_user) or (b.blocker_id=target_user and b.blocked_id=auth.uid()));
$$;
alter policy "Read own garden" on public.gardens using(app_private.owns_active_account(user_id));

create function app_private.block_deleting_account_writes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,6201));
  if exists(select 1 from app_private.account_deletions where user_id=new.user_id) then
    raise exception 'Account deletion in progress' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.block_deleting_account_writes() from public,anon,authenticated;
create trigger block_deleting_account_writes before insert or update on public.gardens
for each row execute function app_private.block_deleting_account_writes();
-- Reconfere depois do lock, inclusive se reserve_my_photo esperou uma exclusão concorrente.
create trigger block_deleting_photo_reservations before insert on app_private.photo_reservations
for each row execute function app_private.block_deleting_account_writes();

alter table app_private.write_budgets drop constraint write_budgets_operation_check;
alter table app_private.write_budgets add constraint write_budgets_operation_check
check(operation in ('garden','profile','photo_upload','photo_read','photo_remove','account_delete'));

-- A tentativa é debitada antes da conferência da senha no Auth.
create function public.authorize_my_account_deletion()
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); moment timestamptz:=statement_timestamp(); utc_day date:=(moment at time zone 'UTC')::date;
begin
  if owner_id is null or not exists(select 1 from auth.users where id=owner_id and deleted_at is null) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  insert into app_private.write_budgets as budget(user_id,operation,tokens,refilled_at,write_day,daily_writes)
  values(owner_id,'account_delete',2,moment,utc_day,1)
  on conflict(user_id,operation) do update set
    tokens=least(3,budget.tokens+greatest(0,extract(epoch from(moment-budget.refilled_at)))/300.0)-1,
    refilled_at=greatest(moment,budget.refilled_at),write_day=greatest(utc_day,budget.write_day),
    daily_writes=case when budget.write_day>=utc_day then budget.daily_writes+1 else 1 end
  where least(3,budget.tokens+greatest(0,extract(epoch from(moment-budget.refilled_at)))/300.0)>=1
    and (budget.write_day<utc_day or budget.daily_writes<10);
  if not found then raise exception 'Deletion attempt limit' using errcode='PT429'; end if;
end;
$$;
revoke all on function public.authorize_my_account_deletion() from public,anon,authenticated;
grant execute on function public.authorize_my_account_deletion() to authenticated;

-- Só o servidor, após conferir a senha, pode iniciar o bloqueio persistente.
create function public.begin_account_deletion(target_user uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if target_user is null or not exists(select 1 from auth.users where id=target_user and deleted_at is null) then
    raise exception 'Account unavailable' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plant-photos',6202));
  perform pg_advisory_xact_lock(hashtextextended(target_user::text,6201));
  if exists(select 1 from app_private.photo_reservations r where r.user_id=target_user
    and not exists(select 1 from storage.objects o where o.bucket_id='plant-photos' and o.name=r.path)) then
    raise exception 'Upload in progress or unresolved' using errcode='PT409';
  end if;
  insert into app_private.account_deletions(user_id) values(target_user) on conflict(user_id) do nothing;
end;
$$;
revoke all on function public.begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.begin_account_deletion(uuid) to service_role;
commit;
