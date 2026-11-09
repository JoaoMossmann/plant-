begin;

-- Contadores privados: uma linha por conta e operação, removida com a conta.
create table app_private.write_budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check(operation in ('garden','profile')),
  tokens numeric not null check(tokens >= 0),
  refilled_at timestamptz not null,
  write_day date not null,
  daily_writes integer not null check(daily_writes > 0),
  primary key(user_id,operation)
);
alter table app_private.write_budgets enable row level security;
revoke all on app_private.write_budgets from public,anon,authenticated;

create function app_private.limit_account_writes()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  operation_name text;
  capacity integer;
  daily_limit integer;
  moment timestamptz := statement_timestamp();
  utc_day date := (moment at time zone 'UTC')::date;
begin
  if owner_id is null or owner_id <> new.user_id then
    raise exception 'Authentication required for owner' using errcode='42501';
  end if;
  if tg_table_schema='public' and tg_table_name='gardens' then
    operation_name := 'garden'; capacity := 30; daily_limit := 2000;
  elsif tg_table_schema='public' and tg_table_name='profiles' then
    operation_name := 'profile'; capacity := 10; daily_limit := 100;
  else
    raise exception 'Unsupported operation';
  end if;

  -- UPSERT trava a linha: requisições concorrentes disputam o mesmo saldo.
  -- Reposição gradual por minuto; cota diária em UTC. Falhas desfazem o débito.
  insert into app_private.write_budgets as budget
    (user_id,operation,tokens,refilled_at,write_day,daily_writes)
  values(owner_id,operation_name,capacity-1,moment,utc_day,1)
  on conflict(user_id,operation) do update set
    tokens=least(capacity, budget.tokens + greatest(0,extract(epoch from (moment-budget.refilled_at))) * capacity/60.0)-1,
    refilled_at=greatest(moment,budget.refilled_at),
    write_day=greatest(utc_day,budget.write_day),
    daily_writes=case when budget.write_day>=utc_day then budget.daily_writes+1 else 1 end
  where least(capacity, budget.tokens + greatest(0,extract(epoch from (moment-budget.refilled_at))) * capacity/60.0) >= 1
    and (budget.write_day<utc_day or budget.daily_writes<daily_limit);
  if not found then
    raise exception 'Write limit reached; retry later' using errcode='PT429';
  end if;
  return new;
end;
$$;
revoke all on function app_private.limit_account_writes() from public,anon,authenticated;
create trigger limit_garden_writes before insert or update on public.gardens
  for each row execute function app_private.limit_account_writes();
create trigger limit_profile_writes before insert or update on public.profiles
  for each row execute function app_private.limit_account_writes();

commit;
