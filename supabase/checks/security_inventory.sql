-- Somente leitura: inventário de configuração, sem consultar dados de usuários.
-- Uma única linha JSON para o SQL Editor preservar todas as seções na exportação.
begin read only;
set local statement_timeout = '5s';

with expected(schema_name, table_name) as (values
  ('public','gardens'), ('public','profiles'), ('public','member_blocks'),
  ('public','cities'), ('storage','objects'),
  ('app_private','community_account_status'), ('app_private','write_budgets'),
  ('app_private','photo_reservations'), ('app_private','photo_tombstones'), ('app_private','account_deletions')
), tables_report as (
select e.schema_name, e.table_name, c.oid is not null as installed,
  c.relrowsecurity as rls_enabled
from expected e
left join pg_namespace n on n.nspname=e.schema_name
left join pg_class c on c.relnamespace=n.oid and c.relname=e.table_name
order by 1,2
), policies_report as (
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where (schemaname='public' and tablename in ('gardens','profiles','member_blocks','cities'))
  or (schemaname='storage' and tablename='objects')
  or schemaname='app_private'
order by schemaname,tablename,policyname
), table_permissions_report as (
select table_schema,table_name,grantee,privilege_type
from information_schema.table_privileges
where grantee in ('anon','authenticated','PUBLIC')
  and ((table_schema='public' and table_name in ('gardens','profiles','member_blocks','cities'))
    or table_schema='app_private')
order by 1,2,3,4
), column_permissions_report as (
select table_schema,table_name,column_name,grantee,privilege_type
from information_schema.column_privileges
where table_schema='public' and table_name='profiles'
  and grantee in ('anon','authenticated','PUBLIC')
order by 1,2,3,4,5
), functions_report as (
select n.nspname as schema_name,p.proname,p.prosecdef as security_definer,
  p.oid::regprocedure::text as signature,p.proconfig as settings,p.proacl as permissions
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('save_my_garden','reserve_my_photo','finish_photo_reservation','authorize_my_photo','prepare_my_photo_removal','pending_my_photo_removals','authorize_my_account_deletion','begin_account_deletion')) or n.nspname='app_private'
order by 1,2
), triggers_report as (
select event_object_schema,event_object_table,trigger_name,action_timing,event_manipulation
from information_schema.triggers
where event_object_schema='public' and event_object_table in ('gardens','profiles')
order by 1,2,3,5
), buckets_report as (
select id,public,file_size_limit,allowed_mime_types
from storage.buckets where id='plant-photos'
)
select jsonb_build_object(
  'tables',coalesce((select jsonb_agg(to_jsonb(r)) from tables_report r),'[]'::jsonb),
  'policies',coalesce((select jsonb_agg(to_jsonb(r)) from policies_report r),'[]'::jsonb),
  'table_permissions',coalesce((select jsonb_agg(to_jsonb(r)) from table_permissions_report r),'[]'::jsonb),
  'column_permissions',coalesce((select jsonb_agg(to_jsonb(r)) from column_permissions_report r),'[]'::jsonb),
  'functions',coalesce((select jsonb_agg(to_jsonb(r)) from functions_report r),'[]'::jsonb),
  'triggers',coalesce((select jsonb_agg(to_jsonb(r)) from triggers_report r),'[]'::jsonb),
  'buckets',coalesce((select jsonb_agg(to_jsonb(r)) from buckets_report r),'[]'::jsonb)
) as security_inventory;
commit;
