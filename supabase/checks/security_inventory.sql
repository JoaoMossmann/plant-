-- Somente leitura: inventário de configuração, sem consultar dados de usuários.
begin read only;
set local statement_timeout = '5s';

with expected(schema_name, table_name) as (values
  ('public','gardens'), ('public','profiles'), ('public','member_blocks'),
  ('public','cities'), ('storage','objects'),
  ('app_private','community_account_status'), ('app_private','write_budgets')
)
select e.schema_name, e.table_name, c.oid is not null as installed,
  c.relrowsecurity as rls_enabled
from expected e
left join pg_namespace n on n.nspname=e.schema_name
left join pg_class c on c.relnamespace=n.oid and c.relname=e.table_name
order by 1,2;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where (schemaname='public' and tablename in ('gardens','profiles','member_blocks','cities'))
  or (schemaname='storage' and tablename='objects')
  or schemaname='app_private'
order by schemaname,tablename,policyname;

select table_schema,table_name,grantee,privilege_type
from information_schema.table_privileges
where grantee in ('anon','authenticated','PUBLIC')
  and ((table_schema='public' and table_name in ('gardens','profiles','member_blocks','cities'))
    or table_schema='app_private')
order by 1,2,3,4;

select table_schema,table_name,column_name,grantee,privilege_type
from information_schema.column_privileges
where table_schema='public' and table_name='profiles'
  and grantee in ('anon','authenticated','PUBLIC')
order by 1,2,3,4,5;

select n.nspname as schema_name,p.proname,p.prosecdef as security_definer,
  p.proconfig as settings,p.proacl as permissions
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname='save_my_garden') or n.nspname='app_private'
order by 1,2;

select event_object_schema,event_object_table,trigger_name,action_timing,event_manipulation
from information_schema.triggers
where event_object_schema='public' and event_object_table in ('gardens','profiles')
order by 1,2,3,5;

select id,public,file_size_limit,allowed_mime_types
from storage.buckets where id='plant-photos';
commit;
