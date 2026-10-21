-- Execute depois de 202610210001_private_gardens.sql.
-- Validação adicional para clientes que tentem contornar os formulários.
begin;
create function public.validate_garden_payload()
returns trigger language plpgsql set search_path='' as $$
declare p jsonb; h jsonb;
begin
  for p in select value from jsonb_array_elements(new.plants) loop
    if jsonb_typeof(p->'id') is distinct from 'string' or (p->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid ID'; end if;
    if jsonb_typeof(p->'name') is distinct from 'string' or jsonb_typeof(p->'species') is distinct from 'string' then raise exception 'Names must be text'; end if;
    if jsonb_typeof(p->'acquired') is distinct from 'string' then raise exception 'Invalid date'; end if;
    if jsonb_typeof(p->'interval') is distinct from 'number' then raise exception 'Invalid interval'; end if;
    if jsonb_typeof(p->'history') is distinct from 'array' then raise exception 'Invalid history'; end if;
    if p ? 'notes' and jsonb_typeof(p->'notes') is distinct from 'string' then raise exception 'Invalid notes'; end if;
    if p ? 'catalogId' and (jsonb_typeof(p->'catalogId') is distinct from 'string' or length(p->>'catalogId') > 80) then raise exception 'Invalid catalog ID'; end if;
    for h in select value from jsonb_array_elements(p->'history') loop
      if jsonb_typeof(h) is distinct from 'object' or not (h ?& array['date','type']) or (h-array['date','type']) <> '{}'::jsonb then raise exception 'Invalid history entry'; end if;
      if jsonb_typeof(h->'date') is distinct from 'string' or (h->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid history date'; end if;
      perform (h->>'date')::date;
      if jsonb_typeof(h->'type') is distinct from 'string' or length(h->>'type') not between 1 and 80 then raise exception 'Invalid care type'; end if;
    end loop;
  end loop;
  return new;
end;
$$;
revoke all on function public.validate_garden_payload() from public,anon,authenticated;
create trigger validate_garden before insert or update on public.gardens for each row execute function public.validate_garden_payload();
commit;
