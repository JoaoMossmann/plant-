-- Base de perfis e cidades. Não aplicar em produção antes da revisão do PR.
-- Não altera jardins existentes, não publica suas fotos e não cria feed ou lojas fictícias.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public,anon,authenticated;
grant usage on schema app_private to authenticated;

create table public.cities (
  id text primary key check(id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id)<=60),
  name text not null check(length(trim(name)) between 2 and 80),
  state_code text not null check(state_code ~ '^[A-Z]{2}$'),
  unique(name,state_code)
);
alter table public.cities enable row level security;
revoke all on public.cities from public,anon,authenticated;
grant select on public.cities to anon,authenticated;
create policy "Cities are public" on public.cities for select to anon,authenticated using(true);
insert into public.cities(id,name,state_code) values
  ('sao-leopoldo-rs','São Leopoldo','RS'),
  ('novo-hamburgo-rs','Novo Hamburgo','RS'),
  ('esteio-rs','Esteio','RS'),
  ('sapucaia-do-sul-rs','Sapucaia do Sul','RS');

-- Estado de moderação separado do perfil, sem permissão de escrita pelo cliente.
create table app_private.community_account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check(status in ('active','suspended')),
  updated_at timestamptz not null default now()
);
alter table app_private.community_account_status enable row level security;
revoke all on app_private.community_account_status from public,anon,authenticated;
grant select,insert,update,delete on app_private.community_account_status to service_role;

create function app_private.is_community_member()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from auth.users u
    where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null
      and not exists(select 1 from app_private.community_account_status s where s.user_id=u.id and s.status='suspended')
  );
$$;
revoke all on function app_private.is_community_member() from public,anon;
grant execute on function app_private.is_community_member() to authenticated;

-- Conta suspensa pode consultar o próprio perfil para gerenciar seus dados.
-- Conta marcada como excluída não pode continuar lendo com um token antigo.
create function app_private.owns_active_account(target_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select target_user=auth.uid() and exists(select 1 from auth.users u where u.id=auth.uid() and u.deleted_at is null);
$$;
revoke all on function app_private.owns_active_account(uuid) from public,anon;
grant execute on function app_private.owns_active_account(uuid) to authenticated;

create table public.member_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id<>blocked_id)
);
create index member_blocks_reverse on public.member_blocks(blocked_id,blocker_id);
alter table public.member_blocks enable row level security;
revoke all on public.member_blocks from public,anon,authenticated;
grant select,delete on public.member_blocks to authenticated;
grant insert(blocker_id,blocked_id) on public.member_blocks to authenticated;
create policy "Read own blocks" on public.member_blocks for select to authenticated
  using(app_private.owns_active_account(blocker_id));
create policy "Create own block" on public.member_blocks for insert to authenticated
  with check(blocker_id=(select auth.uid()) and (select app_private.is_community_member()));
create policy "Remove own block" on public.member_blocks for delete to authenticated
  using(app_private.owns_active_account(blocker_id));

-- O solicitante sempre vem da sessão; nunca de um viewer_id enviado pelo cliente.
create function app_private.can_read_member(target_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_community_member()
    and exists(
      select 1 from auth.users u where u.id=target_user and u.email_confirmed_at is not null and u.deleted_at is null
        and not exists(select 1 from app_private.community_account_status s where s.user_id=u.id and s.status='suspended')
    )
    and not exists(
      select 1 from public.member_blocks b
      where (b.blocker_id=auth.uid() and b.blocked_id=target_user)
         or (b.blocker_id=target_user and b.blocked_id=auth.uid())
    );
$$;
revoke all on function app_private.can_read_member(uuid) from public,anon;
grant execute on function app_private.can_read_member(uuid) to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check(handle ~ '^[a-z][a-z0-9_]{2,29}$'),
  display_name text not null check(length(trim(display_name)) between 2 and 60),
  bio text not null default '' check(length(bio)<=500),
  city_id text references public.cities(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reserved_profile_handle check(handle not in ('admin','administrador','suporte','support','moderador','moderacao','sistema','equipe','meujardim'))
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public,anon,authenticated;
grant select on public.profiles to authenticated;
grant insert(user_id,handle,display_name,bio,city_id) on public.profiles to authenticated;
grant update(handle,display_name,bio,city_id) on public.profiles to authenticated;
create policy "Members read permitted profiles" on public.profiles for select to authenticated
  using(app_private.owns_active_account(user_id) or app_private.can_read_member(user_id));
create policy "Confirmed members create own profile" on public.profiles for insert to authenticated
  with check(user_id=(select auth.uid()) and (select app_private.is_community_member()));
create policy "Confirmed members edit own profile" on public.profiles for update to authenticated
  using(user_id=(select auth.uid()) and (select app_private.is_community_member()))
  with check(user_id=(select auth.uid()) and (select app_private.is_community_member()));

create function app_private.touch_profile_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at:=statement_timestamp();
  return new;
end;
$$;
revoke all on function app_private.touch_profile_updated_at() from public,anon,authenticated;
create trigger touch_profile before update on public.profiles for each row execute function app_private.touch_profile_updated_at();

-- Operação de backend com credencial de servidor; nunca usar service_role no navegador.
grant usage on schema app_private to service_role;
grant select,insert,update,delete on public.profiles,public.member_blocks,public.cities to service_role;
commit;
