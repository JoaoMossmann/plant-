begin;

-- A função plant-photos deve estar publicada antes de ativar este fluxo.
-- Não modifica o esquema interno do Storage; apenas consulta seus metadados.
create table app_private.photo_reservations (
  path text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check(path ~ ('^'||user_id::text||'/[0-9a-f-]{36}\.jpg$'))
);
create index photo_reservations_owner on app_private.photo_reservations(user_id);
alter table app_private.photo_reservations enable row level security;
revoke all on app_private.photo_reservations from public,anon,authenticated;

create table app_private.photo_tombstones (
  path text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check(path ~ ('^'||user_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
alter table app_private.photo_tombstones enable row level security;
revoke all on app_private.photo_tombstones from public,anon,authenticated;

alter table app_private.write_budgets drop constraint write_budgets_operation_check;
alter table app_private.write_budgets add constraint write_budgets_operation_check
  check(operation in ('garden','profile','photo_upload','photo_read','photo_remove'));

create function app_private.consume_photo_budget(operation_name text)
returns void language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  capacity integer;
  daily_limit integer;
  moment timestamptz := statement_timestamp();
  utc_day date := (moment at time zone 'UTC')::date;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  case operation_name
    when 'photo_upload' then capacity:=5; daily_limit:=50;
    when 'photo_read' then capacity:=120; daily_limit:=10000;
    when 'photo_remove' then capacity:=20; daily_limit:=1000;
    else raise exception 'Invalid operation';
  end case;
  insert into app_private.write_budgets as budget
    (user_id,operation,tokens,refilled_at,write_day,daily_writes)
  values(owner_id,operation_name,capacity-1,moment,utc_day,1)
  on conflict(user_id,operation) do update set
    tokens=least(capacity,budget.tokens+greatest(0,extract(epoch from(moment-budget.refilled_at)))*capacity/60.0)-1,
    refilled_at=greatest(moment,budget.refilled_at),
    write_day=greatest(utc_day,budget.write_day),
    daily_writes=case when budget.write_day>=utc_day then budget.daily_writes+1 else 1 end
  where least(capacity,budget.tokens+greatest(0,extract(epoch from(moment-budget.refilled_at)))*capacity/60.0)>=1
    and (budget.write_day<utc_day or budget.daily_writes<daily_limit);
  if not found then raise exception 'Photo rate limit' using errcode='PT429'; end if;
end;
$$;
revoke all on function app_private.consume_photo_budget(text) from public,anon,authenticated;

create function public.reserve_my_photo()
returns text language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  object_count bigint;
  total_bytes bigint;
  project_count bigint;
  project_bytes bigint;
  new_path text;
begin
  if not coalesce(app_private.is_community_member(),false) then
    raise exception 'Confirmed active account required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plant-photos',6202));
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,6201));
  perform app_private.consume_photo_budget('photo_upload');
  -- Um único snapshot conta arquivos existentes e reservas ainda sem objeto.
  -- Reservas nunca expiram automaticamente: falhas incertas preservam a cota.
  with objects as materialized (
    select name,split_part(name,'/',1) as owner,case when metadata->>'size' ~ '^[0-9]{1,12}$'
      then (metadata->>'size')::bigint else 2097152 end as bytes
    from storage.objects
    where bucket_id='plant-photos'
  ), occupied as (
    select owner,bytes from objects
    union all
    select r.user_id::text,2097152 from app_private.photo_reservations r
    where not exists(select 1 from objects o where o.name=r.path)
  ) select count(*) filter(where owner=owner_id::text),coalesce(sum(bytes) filter(where owner=owner_id::text),0),
      count(*),coalesce(sum(bytes),0)
    into object_count,total_bytes,project_count,project_bytes from occupied;
  if object_count>=100 or total_bytes+2097152>52428800
    or project_count>=5000 or project_bytes+2097152>524288000 then
    raise exception 'Photo quota reached' using errcode='PT413';
  end if;
  new_path:=owner_id::text||'/'||gen_random_uuid()::text||'.jpg';
  insert into app_private.photo_reservations(path,user_id) values(new_path,owner_id);
  return new_path;
end;
$$;
revoke all on function public.reserve_my_photo() from public,anon,authenticated;
grant execute on function public.reserve_my_photo() to authenticated;

-- Só o backend pode cancelar uma reserva; o navegador não consegue liberar espaço
-- enquanto um upload ainda estiver em andamento.
create function public.finish_photo_reservation(photo_path text, uploaded boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  delete from app_private.photo_reservations r where r.path=photo_path
    and (uploaded and exists(select 1 from storage.objects o where o.bucket_id='plant-photos' and o.name=r.path)
      or not uploaded and not exists(select 1 from storage.objects o where o.bucket_id='plant-photos' and o.name=r.path));
end;
$$;
revoke all on function public.finish_photo_reservation(text,boolean) from public,anon,authenticated;
grant execute on function public.finish_photo_reservation(text,boolean) to service_role;

create function public.authorize_my_photo(photo_path text)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
  if not coalesce(app_private.owns_active_account(owner_id),false)
    or photo_path is null or photo_path !~ ('^'||owner_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Invalid photo owner' using errcode='42501';
  end if;
  perform app_private.consume_photo_budget('photo_read');
  if exists(select 1 from app_private.photo_tombstones where path=photo_path)
    or not exists(select 1 from storage.objects where bucket_id='plant-photos' and name=photo_path) then
    raise exception 'Photo not found' using errcode='PT404';
  end if;
end;
$$;
revoke all on function public.authorize_my_photo(text) from public,anon,authenticated;
grant execute on function public.authorize_my_photo(text) to authenticated;

create function public.prepare_my_photo_removal(photo_paths text[])
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); item text;
begin
  if not coalesce(app_private.owns_active_account(owner_id),false) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if photo_paths is null or cardinality(photo_paths) not between 1 and 50 then
    raise exception 'Invalid photo batch' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,6201));
  perform app_private.consume_photo_budget('photo_remove');
  foreach item in array photo_paths loop
    if item is null or item !~ ('^'||owner_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') then
      raise exception 'Invalid photo owner' using errcode='42501';
    end if;
    if exists(select 1 from public.gardens g,jsonb_array_elements(g.plants) p
      where g.user_id=owner_id and p->>'photoPath'=item) then
      raise exception 'Photo still in garden' using errcode='PT409';
    end if;
    if exists(select 1 from storage.objects where bucket_id='plant-photos' and name=item)
      or exists(select 1 from app_private.photo_reservations where path=item and user_id=owner_id) then
      insert into app_private.photo_tombstones(path,user_id) values(item,owner_id) on conflict(path) do nothing;
    end if;
  end loop;
end;
$$;
revoke all on function public.prepare_my_photo_removal(text[]) from public,anon,authenticated;
grant execute on function public.prepare_my_photo_removal(text[]) to authenticated;

create function public.pending_my_photo_removals()
returns text[] language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result text[];
begin
  if not coalesce(app_private.owns_active_account(owner_id),false) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  perform app_private.consume_photo_budget('photo_remove');
  select coalesce(array_agg(path),'{}'::text[]) into result from (
    select t.path from app_private.photo_tombstones t
    where t.user_id=owner_id and exists(select 1 from storage.objects o where o.bucket_id='plant-photos' and o.name=t.path)
    order by t.created_at limit 50
  ) pending;
  return result;
end;
$$;
revoke all on function public.pending_my_photo_removals() from public,anon,authenticated;
grant execute on function public.pending_my_photo_removals() to authenticated;

create function app_private.protect_garden_photos()
returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; photo_path text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,6201));
  for item in select value from jsonb_array_elements(new.plants) loop
    photo_path:=item->>'photoPath';
    if photo_path is not null and (
      photo_path !~ ('^'||new.user_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')
      or exists(select 1 from app_private.photo_tombstones where path=photo_path)
      or not exists(select 1 from storage.objects where bucket_id='plant-photos' and name=photo_path)
    ) then raise exception 'Photo unavailable' using errcode='PT409'; end if;
  end loop;
  if tg_op='UPDATE' then
    insert into app_private.photo_tombstones(path,user_id)
      select distinct p->>'photoPath',new.user_id from jsonb_array_elements(old.plants) p
      where p->>'photoPath' ~ ('^'||new.user_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') and not exists(
        select 1 from jsonb_array_elements(new.plants) retained where retained->>'photoPath'=p->>'photoPath'
      ) on conflict(path) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.protect_garden_photos() from public,anon,authenticated;
create trigger protect_garden_photos before insert or update on public.gardens
  for each row execute function app_private.protect_garden_photos();

-- Obriga clientes autenticados a passar pela função; não há fallback de Storage.
drop policy "Read own plant photos" on storage.objects;
drop policy "Upload own plant photos" on storage.objects;
drop policy "Delete own plant photos" on storage.objects;
commit;
