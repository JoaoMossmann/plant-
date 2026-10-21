-- Execute uma vez no SQL Editor do projeto Supabase.
-- Senhas são geridas pelo Supabase Auth, nunca por esta tabela ou pelo código público.
begin;

create table public.gardens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plants jsonb not null default '[]'::jsonb,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  constraint garden_array check (jsonb_typeof(plants) = 'array'),
  constraint garden_count check (jsonb_array_length(plants) <= 1000)
);
alter table public.gardens enable row level security;
revoke all on public.gardens from anon, authenticated;
grant select on public.gardens to authenticated;
create policy "Read own garden" on public.gardens for select to authenticated
using ((select auth.uid()) = user_id);

-- A revisão impede que um dispositivo sobrescreva silenciosamente alterações de outro.
-- Sem permissão de INSERT/UPDATE/DELETE diretamente na tabela.
create function public.save_my_garden(expected_version bigint, new_plants jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  result_version bigint;
  item jsonb;
  ids text[] := '{}';
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_version is null or expected_version < 0 then raise exception 'Invalid revision'; end if;
  if new_plants is null or jsonb_typeof(new_plants) <> 'array' then raise exception 'Expected array'; end if;
  if jsonb_array_length(new_plants) > 1000 or octet_length(new_plants::text) > 2000000 then raise exception 'Garden too large'; end if;
  for item in select value from jsonb_array_elements(new_plants) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['id','name','species','acquired','interval','history']) then raise exception 'Invalid plant'; end if;
    if (item - array['id','name','species','catalogId','acquired','interval','notes','lastWatered','history','photoPath']) <> '{}'::jsonb then raise exception 'Unknown fields'; end if;
    if item->>'id' is null or item->>'id' !~ '^[0-9a-fA-F-]{36}$' or (item->>'id') = any(ids) then raise exception 'Invalid or duplicate ID'; end if;
    ids := array_append(ids, item->>'id');
    if coalesce(length(trim(item->>'name')),0) not between 1 and 80 or coalesce(length(trim(item->>'species')),0) not between 1 and 120 then raise exception 'Invalid name'; end if;
    if jsonb_typeof(item->'interval') <> 'number' or (item->>'interval')::numeric <> trunc((item->>'interval')::numeric) or (item->>'interval')::numeric not between 1 and 365 then raise exception 'Invalid interval'; end if;
    if coalesce(length(item->>'notes'),0) > 2000 then raise exception 'Notes too long'; end if;
    if item->>'acquired' !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'acquired')::date > current_date then raise exception 'Invalid acquisition date'; end if;
    if item->>'lastWatered' is not null then
      if item->>'lastWatered' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid watering date'; end if;
      perform (item->>'lastWatered')::date;
    end if;
    if jsonb_typeof(item->'history') <> 'array' or jsonb_array_length(item->'history') > 2000 then raise exception 'Invalid care history'; end if;
    if item->>'photoPath' is not null and (item->>'photoPath') !~ ('^' || owner_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'Invalid photo owner'; end if;
  end loop;
  if expected_version = 0 then
    insert into public.gardens(user_id,plants) values(owner_id,new_plants)
      on conflict (user_id) do nothing returning version into result_version;
  else
    update public.gardens set plants=new_plants,version=version+1,updated_at=now()
      where user_id=owner_id and version=expected_version returning version into result_version;
  end if;
  if result_version is null then raise exception 'Garden changed; reload before saving' using errcode='40001'; end if;
  return result_version;
end;
$$;
revoke all on function public.save_my_garden(bigint,jsonb) from public, anon;
grant execute on function public.save_my_garden(bigint,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('plant-photos','plant-photos',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy "Read own plant photos" on storage.objects for select to authenticated
using (bucket_id='plant-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Upload own plant photos" on storage.objects for insert to authenticated
with check (bucket_id='plant-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Delete own plant photos" on storage.objects for delete to authenticated
using (bucket_id='plant-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Sem política de UPDATE: cada upload usa um caminho novo, sem sobrescrever arquivos.
commit;
