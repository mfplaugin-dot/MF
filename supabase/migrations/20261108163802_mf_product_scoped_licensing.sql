-- Applied to mfplugin-staging as migration 20261108163802.
create or replace function public.mf_activate_and_register_product_device(p_user_id uuid,p_product_id uuid,p_device_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare activation_time timestamptz:=clock_timestamp(); selected_entitlement public.mf_entitlements%rowtype;
 selected_plan public.mf_product_plans%rowtype; existing_revoked_at timestamptz; active_devices integer;
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' or p_user_id is null or p_product_id is null
  or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 if not exists(select 1 from public.mf_products where id=p_product_id and status='active') then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_product_id::text,17411));
 if exists(select 1 from public.mf_account_controls where user_id=p_user_id and status='suspended') then return null; end if;
 select * into selected_entitlement from public.mf_entitlements where user_id=p_user_id and product_id=p_product_id
  and plan='lifetime' and status='active' and starts_at<=activation_time and ends_at is null order by created_at desc limit 1;
 if not found then
  select * into selected_entitlement from public.mf_entitlements where user_id=p_user_id and product_id=p_product_id
   and plan='monthly' and status='active' and starts_at<=activation_time and ends_at>activation_time order by ends_at desc,created_at desc limit 1;
 end if;
 if not found then
  select * into selected_entitlement from public.mf_entitlements where user_id=p_user_id and product_id=p_product_id
   and plan='monthly' and status='pending_activation' order by created_at,id limit 1;
 end if;
 if not found then return null; end if;
 select * into selected_plan from public.mf_product_plans where id=selected_entitlement.plan_id and product_id=p_product_id and is_active=true;
 if not found then return null; end if;
 select count(*) into active_devices from public.mf_license_devices where user_id=p_user_id and product_id=p_product_id and revoked_at is null;
 select revoked_at into existing_revoked_at from public.mf_license_devices
  where user_id=p_user_id and product_id=p_product_id and device_hash=p_device_hash for update;
 if found then
  if existing_revoked_at is not null then return null; end if;
  if active_devices>selected_plan.device_limit and not exists(
   select 1 from (select device_hash from public.mf_license_devices where user_id=p_user_id and product_id=p_product_id
    and revoked_at is null order by first_seen_at,id limit selected_plan.device_limit) permitted where permitted.device_hash=p_device_hash
  ) then return null; end if;
  update public.mf_license_devices set last_seen_at=activation_time where user_id=p_user_id and product_id=p_product_id and device_hash=p_device_hash;
 else
  if active_devices>=selected_plan.device_limit then return null; end if;
  insert into public.mf_license_devices(user_id,product_id,device_hash,first_seen_at,last_seen_at)
   values(p_user_id,p_product_id,p_device_hash,activation_time,activation_time);
 end if;
 if selected_entitlement.status='pending_activation' then
  if selected_plan.billing_type<>'monthly' or selected_plan.duration_days is null then return null; end if;
  update public.mf_entitlements set status='active',starts_at=activation_time,
   ends_at=activation_time+make_interval(days=>selected_plan.duration_days),updated_at=activation_time
  where id=selected_entitlement.id and user_id=p_user_id and product_id=p_product_id and status='pending_activation'
  returning * into selected_entitlement;
  if not found then return null; end if;
 end if;
 return jsonb_build_object('id',selected_entitlement.id,'product_id',selected_entitlement.product_id,
  'plan',selected_entitlement.plan,'plan_id',selected_entitlement.plan_id,'status',selected_entitlement.status,
  'starts_at',selected_entitlement.starts_at,'ends_at',selected_entitlement.ends_at,
  'device_limit',selected_plan.device_limit,'created_at',selected_entitlement.created_at);
end; $$;

create or replace function public.mf_admin_grant_product_entitlement(
 p_actor_user_id uuid,p_target_user_id uuid,p_product_id uuid,p_plan_id uuid,p_payment_reference text,p_grant_reason text
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare selected_plan public.mf_product_plans%rowtype; created_id uuid; grant_time timestamptz:=clock_timestamp();
 normalized_reference text:=nullif(btrim(p_payment_reference),''); normalized_reason text:=nullif(btrim(p_grant_reason),'');
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' or p_actor_user_id is null or p_target_user_id is null
  or p_product_id is null or p_plan_id is null or normalized_reason is null or length(normalized_reason)>500
  or length(coalesce(normalized_reference,''))>200 then
  raise exception using errcode='22023',message='Valid administrator grant details are required.';
 end if;
 select * into selected_plan from public.mf_product_plans where id=p_plan_id and product_id=p_product_id and is_active=true;
 if not found or selected_plan.code not in('monthly','lifetime') then raise exception using errcode='22023',message='The selected product plan is unavailable.'; end if;
 if selected_plan.code='monthly' and normalized_reference is null then raise exception using errcode='22023',message='A verified payment reference is required for Monthly.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_target_user_id::text||':'||p_product_id::text,17411));
 if not exists(select 1 from auth.users where id=p_target_user_id) then raise exception using errcode='P0002',message='Account not found.'; end if;
 if exists(select 1 from public.mf_account_controls where user_id=p_target_user_id and status='suspended') then raise exception using errcode='42501',message='This account is suspended.'; end if;
 if selected_plan.code='monthly' and exists(select 1 from public.mf_entitlements where user_id=p_target_user_id and product_id=p_product_id and plan='lifetime' and status='active' and starts_at<=grant_time and ends_at is null) then raise exception using errcode='P0001',message='MF_LIFETIME_ACTIVE'; end if;
 if selected_plan.code='monthly' and exists(select 1 from public.mf_entitlements where user_id=p_target_user_id and product_id=p_product_id and plan='monthly' and status='pending_activation') then raise exception using errcode='P0001',message='MF_MONTHLY_PENDING_ACTIVATION'; end if;
 if selected_plan.code='lifetime' and exists(select 1 from public.mf_entitlements where user_id=p_target_user_id and product_id=p_product_id and plan='lifetime' and status='active' and starts_at<=grant_time and ends_at is null) then raise exception using errcode='P0001',message='MF_LIFETIME_ALREADY_ACTIVE'; end if;
 insert into public.mf_entitlements(user_id,product_id,plan_id,plan,status,starts_at,ends_at,granted_by)
 values(p_target_user_id,p_product_id,p_plan_id,selected_plan.code,
  case when selected_plan.billing_type='monthly' then 'pending_activation' else 'active' end,
  case when selected_plan.billing_type='monthly' then null else grant_time end,null,p_actor_user_id)
 returning id into created_id;
 insert into public.mf_license_admin_audit(actor_user_id,target_user_id,action,entitlement_id,product_id,payment_reference,grant_reason,created_at)
 values(p_actor_user_id,p_target_user_id,'grant-'||selected_plan.code,created_id,p_product_id,normalized_reference,normalized_reason,grant_time);
 return created_id;
end; $$;

create or replace function public.mf_admin_revoke_product_device(p_actor_user_id uuid,p_target_user_id uuid,p_product_id uuid,p_device_hash text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' or p_actor_user_id is null or p_target_user_id is null
  or p_product_id is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then return false; end if;
 update public.mf_license_devices set revoked_at=coalesce(revoked_at,now())
 where user_id=p_target_user_id and product_id=p_product_id and device_hash=p_device_hash and revoked_at is null;
 get diagnostics changed=row_count;
 if changed=0 then return false; end if;
 insert into public.mf_license_admin_audit(actor_user_id,target_user_id,action,product_id)
 values(p_actor_user_id,p_target_user_id,'revoke-device',p_product_id);
 return true;
end; $$;

create index if not exists mf_license_devices_user_product_status_idx
 on public.mf_license_devices(user_id,product_id,revoked_at,first_seen_at);
revoke all on function public.mf_activate_and_register_product_device(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mf_activate_and_register_product_device(uuid,uuid,text) to service_role;
revoke all on function public.mf_admin_grant_product_entitlement(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.mf_admin_grant_product_entitlement(uuid,uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.mf_admin_revoke_product_device(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mf_admin_revoke_product_device(uuid,uuid,uuid,text) to service_role;
