-- Base de agendamento, sem provedor de envio ativado.
-- Execute somente depois de revisar o PR. Não agenda tarefas nem envia mensagens.
begin;

create table public.reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  time_zone text not null default 'America/Sao_Paulo',
  local_hour integer not null default 9 check(local_hour between 0 and 23),
  updated_at timestamptz not null default now()
);
alter table public.reminder_preferences enable row level security;
revoke all on public.reminder_preferences from anon,authenticated;
grant select on public.reminder_preferences to authenticated;
create policy "Read own reminder preferences" on public.reminder_preferences
  for select to authenticated using ((select auth.uid())=user_id);

-- Configuração operacional privada. Cota zero e envio desativado por padrão.
-- Um administrador só deve ativar depois de configurar e validar o provedor.
create table public.reminder_service_config (
  id boolean primary key default true check(id),
  ready boolean not null default false,
  daily_limit integer not null default 0 check(daily_limit between 0 and 100),
  provider text
);
insert into public.reminder_service_config(id) values(true);
alter table public.reminder_service_config enable row level security;
revoke all on public.reminder_service_config from public,anon,authenticated;
grant select,update on public.reminder_service_config to service_role;

create function public.save_my_reminder_preferences(requested_zone text,requested_hour integer,requested_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if requested_enabled is null or requested_hour is null or requested_hour not between 0 and 23 then raise exception 'Invalid reminder preference'; end if;
  if requested_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=requested_zone) then raise exception 'Invalid time zone'; end if;
  if requested_enabled and not exists(select 1 from public.reminder_service_config where ready and daily_limit>0 and provider is not null) then
    raise exception 'Reminder delivery is not configured';
  end if;
  insert into public.reminder_preferences(user_id,enabled,time_zone,local_hour)
    values(owner_id,requested_enabled,requested_zone,requested_hour)
    on conflict(user_id) do update set enabled=excluded.enabled,time_zone=excluded.time_zone,local_hour=excluded.local_hour,updated_at=now();
end;
$$;
revoke all on function public.save_my_reminder_preferences(text,integer,boolean) from public,anon;
grant execute on function public.save_my_reminder_preferences(text,integer,boolean) to authenticated;

-- Somente o servidor pode consultar candidatos de várias contas.
-- Resultado não significa envio: a futura fila deverá impor cota e idempotência.
create function public.due_reminder_candidates(reference_time timestamptz default now())
returns table(user_id uuid,plant_id uuid,plant_name text,anchor_date date,due_on date)
language sql stable security definer set search_path='' as $$
  select g.user_id,(p->>'id')::uuid,p->>'name',
    coalesce(nullif(p->>'lastWatered',''),p->>'acquired')::date as anchor_date,
    coalesce(nullif(p->>'lastWatered',''),p->>'acquired')::date+(p->>'interval')::integer as due_on
  from public.gardens g
  join public.reminder_preferences pref on pref.user_id=g.user_id and pref.enabled
  cross join lateral jsonb_array_elements(g.plants) p
  where reference_time is not null
    and (reference_time at time zone pref.time_zone)::date >= coalesce(nullif(p->>'lastWatered',''),p->>'acquired')::date+(p->>'interval')::integer
    and extract(hour from reference_time at time zone pref.time_zone)>=pref.local_hour;
$$;
revoke all on function public.due_reminder_candidates(timestamptz) from public,anon,authenticated;
grant execute on function public.due_reminder_candidates(timestamptz) to service_role;
commit;
