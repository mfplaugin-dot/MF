-- Applied to mfplugin-staging as migration 20261108164202.
alter table public.mf_products
 add column support_whatsapp text,
 add column content jsonb not null default '{}'::jsonb check(jsonb_typeof(content)='object');
update public.mf_products set support_whatsapp='201016022870' where slug='mf-plugin' and support_whatsapp is null;

alter table public.mf_license_orders add column amount_minor integer, add column currency char(3);
update public.mf_license_orders o set amount_minor=pp.amount_minor,currency=pp.currency
from public.mf_product_plans pp where pp.id=o.plan_id and (o.amount_minor is null or o.currency is null);
alter table public.mf_license_orders alter column amount_minor set not null,alter column currency set not null,
 add constraint mf_license_orders_amount_check check(amount_minor>=0);

alter table public.mf_checkout_sessions add column amount_minor integer,add column currency char(3);
alter table public.mf_entitlements add column device_limit smallint not null default 1;
update public.mf_entitlements e set device_limit=pp.device_limit from public.mf_product_plans pp where pp.id=e.plan_id;
alter table public.mf_entitlements add constraint mf_entitlements_device_limit_check check(device_limit between 1 and 20);

drop trigger mf_entitlements_product_plan_ref on public.mf_entitlements;
drop trigger mf_license_orders_product_plan_ref on public.mf_license_orders;

create or replace function public.mf_set_entitlement_product_plan_refs()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare selected_product_id uuid; selected_plan_id uuid; selected_device_limit smallint;
begin
 if new.product_id is null then
  select id into selected_product_id from public.mf_products where slug='mf-plugin' and status='active';
  new.product_id:=selected_product_id;
 end if;
 select id,device_limit into selected_plan_id,selected_device_limit from public.mf_product_plans
 where product_id=new.product_id and code=new.plan and is_active=true;
 if new.product_id is null or selected_plan_id is null then raise exception 'The selected product plan is not active.'; end if;
 new.plan_id:=selected_plan_id; new.device_limit:=selected_device_limit; return new;
end; $$;

create or replace function public.mf_set_order_product_plan_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare selected_product_id uuid; selected_plan_id uuid; selected_amount integer; selected_currency char(3);
begin
 if new.product_id is null then
  select id into selected_product_id from public.mf_products where slug='mf-plugin' and status='active';
  new.product_id:=selected_product_id;
 end if;
 select id,amount_minor,currency into selected_plan_id,selected_amount,selected_currency
 from public.mf_product_plans where product_id=new.product_id and code=new.plan and is_active=true;
 if new.product_id is null or selected_plan_id is null then raise exception 'The selected product plan is not active.'; end if;
 new.plan_id:=selected_plan_id; new.amount_minor:=selected_amount; new.currency:=selected_currency; return new;
end; $$;

create or replace function public.mf_set_checkout_plan_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare selected_amount integer; selected_currency char(3);
begin
 if new.plan_id is null then new.amount_minor:=null; new.currency:=null; return new; end if;
 select amount_minor,currency into selected_amount,selected_currency from public.mf_product_plans
 where id=new.plan_id and product_id=new.product_id and is_active=true;
 if not found then raise exception 'The checkout plan does not belong to the selected product.'; end if;
 new.amount_minor:=selected_amount; new.currency:=selected_currency; return new;
end; $$;

create trigger mf_entitlements_product_plan_ref before insert or update of product_id,plan on public.mf_entitlements
for each row execute function public.mf_set_entitlement_product_plan_refs();
create trigger mf_license_orders_product_plan_ref before insert or update of product_id,plan on public.mf_license_orders
for each row execute function public.mf_set_order_product_plan_snapshot();
create trigger mf_checkout_plan_snapshot before insert or update of product_id,plan_id on public.mf_checkout_sessions
for each row execute function public.mf_set_checkout_plan_snapshot();

create or replace function public.mf_prevent_referenced_plan_code_change()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.code<>old.code and (
  exists(select 1 from public.mf_entitlements where plan_id=old.id) or
  exists(select 1 from public.mf_license_orders where plan_id=old.id) or
  exists(select 1 from public.mf_checkout_sessions where plan_id=old.id)
 ) then raise exception 'A plan code cannot change after it has been referenced.'; end if;
 return new;
end; $$;
create trigger mf_product_plan_code_immutable before update of code on public.mf_product_plans
for each row execute function public.mf_prevent_referenced_plan_code_change();

-- Order review now snapshots the plan's device limit into each entitlement.
create or replace function public.mf_admin_review_product_order(
 p_actor_user_id uuid,p_order_id uuid,p_decision text,p_payment_reference text,p_review_reason text
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare order_row public.mf_license_orders%rowtype; selected_plan public.mf_product_plans%rowtype;
 created_entitlement_id uuid; review_time timestamptz:=clock_timestamp();
 normalized_reference text:=nullif(btrim(p_payment_reference),''); normalized_reason text:=nullif(btrim(p_review_reason),'');
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' or p_actor_user_id is null or p_order_id is null
  or p_decision not in('approve','reject') or normalized_reason is null or length(normalized_reason)>500
  or length(coalesce(normalized_reference,''))>200 or (p_decision='approve' and normalized_reference is null) then
  raise exception using errcode='22023',message='Invalid order review information.';
 end if;
 select * into order_row from public.mf_license_orders where id=p_order_id;
 if not found then raise exception using errcode='P0002',message='Order not found.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(order_row.account_id::text||':'||order_row.product_id::text,17411));
 select * into order_row from public.mf_license_orders where id=p_order_id for update;
 if order_row.status<>'pending' or order_row.receipt_path is null then raise exception using errcode='P0001',message='Order is no longer pending review.'; end if;
 select * into selected_plan from public.mf_product_plans where id=order_row.plan_id and product_id=order_row.product_id and is_active=true;
 if not found or selected_plan.code not in('monthly','lifetime') then raise exception using errcode='22023',message='The order plan is unavailable.'; end if;
 if p_decision='reject' then
  update public.mf_license_orders set status='rejected',reviewed_at=review_time,reviewed_by=p_actor_user_id where id=p_order_id;
  insert into public.mf_license_admin_audit(actor_user_id,target_user_id,action,order_id,product_id,reason,created_at)
  values(p_actor_user_id,order_row.account_id,'order-rejected',p_order_id,order_row.product_id,normalized_reason,review_time);
  return jsonb_build_object('orderId',p_order_id,'status','rejected');
 end if;
 if selected_plan.code='monthly' and exists(select 1 from public.mf_entitlements where user_id=order_row.account_id and product_id=order_row.product_id and plan='lifetime' and status='active' and starts_at<=review_time and ends_at is null) then raise exception using errcode='P0001',message='MF_LIFETIME_ACTIVE'; end if;
 if selected_plan.code='monthly' and exists(select 1 from public.mf_entitlements where user_id=order_row.account_id and product_id=order_row.product_id and plan='monthly' and status='pending_activation') then raise exception using errcode='P0001',message='MF_MONTHLY_PENDING_ACTIVATION'; end if;
 if selected_plan.code='lifetime' and exists(select 1 from public.mf_entitlements where user_id=order_row.account_id and product_id=order_row.product_id and plan='lifetime' and status='active' and starts_at<=review_time and ends_at is null) then raise exception using errcode='P0001',message='MF_LIFETIME_ALREADY_ACTIVE'; end if;
 insert into public.mf_entitlements(user_id,plan,status,starts_at,ends_at,granted_by,product_id,plan_id,device_limit)
 values(order_row.account_id,selected_plan.code,case when selected_plan.billing_type='monthly' then 'pending_activation' else 'active' end,
 case when selected_plan.billing_type='monthly' then null else review_time end,null,p_actor_user_id,order_row.product_id,selected_plan.id,selected_plan.device_limit)
 returning id into created_entitlement_id;
 update public.mf_license_orders set status='approved',reviewed_at=review_time,reviewed_by=p_actor_user_id where id=p_order_id;
 insert into public.mf_license_admin_audit(actor_user_id,target_user_id,action,entitlement_id,order_id,product_id,payment_reference,grant_reason,created_at)
 values(p_actor_user_id,order_row.account_id,'grant-'||selected_plan.code,created_entitlement_id,p_order_id,order_row.product_id,normalized_reference,normalized_reason,review_time);
 return jsonb_build_object('orderId',p_order_id,'status','approved','entitlementId',created_entitlement_id,
 'entitlementStatus',case when selected_plan.billing_type='monthly' then 'pending_activation' else 'active' end);
end; $$;

create or replace function public.mf_admin_grant_product_entitlement(
 p_actor_user_id uuid,p_target_user_id uuid,p_product_id uuid,p_plan_id uuid,p_payment_reference text,p_grant_reason text
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare selected_plan public.mf_product_plans%rowtype; created_id uuid; grant_time timestamptz:=clock_timestamp();
 normalized_reference text:=nullif(btrim(p_payment_reference),''); normalized_reason text:=nullif(btrim(p_grant_reason),'');
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' or p_actor_user_id is null or p_target_user_id is null
  or p_product_id is null or p_plan_id is null or normalized_reason is null or length(normalized_reason)>500
  or length(coalesce(normalized_reference,''))>200 then raise exception using errcode='22023',message='Valid administrator grant details are required.'; end if;
 select pp.* into selected_plan from public.mf_product_plans pp join public.mf_products p on p.id=pp.product_id
 where pp.id=p_plan_id and pp.product_id=p_product_id and pp.is_active=true and p.status='active';
 if not found or selected_plan.code not in('monthly','lifetime') then raise exception using errcode='22023',message='The selected product plan is unavailable.'; end if;
 if selected_plan.code='monthly' and normalized_reference is null then raise exception using errcode='22023',message='A verified payment reference is required for Monthly.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_target_user_id::text||':'||p_product_id::text,17411));
 if not exists(select 1 from auth.users where id=p_target_user_id) then raise exception using errcode='P0002',message='Account not found.'; end if;
 if exists(select 1 from public.mf_account_controls where user_id=p_target_user_id and status='suspended') then raise exception using errcode='42501',message='This account is suspended.'; end if;
 if selected_plan.code='monthly' and exists(select 1 from public.mf_entitlements where user_id=p_target_user_id and product_id=p_product_id and plan='lifetime' and status='active' and starts_at<=grant_time and ends_at is null) then raise exception using errcode='P0001',message='MF_LIFETIME_ACTIVE'; end if;
 if selected_plan.code='monthly' and exists(select 1 from public.mf_entitlements where user_id=p_target_user_id and product_id=p_product_id and plan='monthly' and status='pending_activation') then raise exception using errcode='P0001',message='MF_MONTHLY_PENDING_ACTIVATION'; end if;
 if selected_plan.code='lifetime' and exists(select 1 from public.mf_entitlements where user_id=p_target_user_id and product_id=p_product_id and plan='lifetime' and status='active' and starts_at<=grant_time and ends_at is null) then raise exception using errcode='P0001',message='MF_LIFETIME_ALREADY_ACTIVE'; end if;
 insert into public.mf_entitlements(user_id,product_id,plan_id,plan,status,starts_at,ends_at,granted_by,device_limit)
 values(p_target_user_id,p_product_id,p_plan_id,selected_plan.code,case when selected_plan.billing_type='monthly' then 'pending_activation' else 'active' end,
 case when selected_plan.billing_type='monthly' then null else grant_time end,null,p_actor_user_id,selected_plan.device_limit)
 returning id into created_id;
 insert into public.mf_license_admin_audit(actor_user_id,target_user_id,action,entitlement_id,product_id,payment_reference,grant_reason,created_at)
 values(p_actor_user_id,p_target_user_id,'grant-'||selected_plan.code,created_id,p_product_id,normalized_reference,normalized_reason,grant_time);
 return created_id;
end; $$;

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
 select * into selected_entitlement from public.mf_entitlements where user_id=p_user_id and product_id=p_product_id and plan='lifetime' and status='active' and starts_at<=activation_time and ends_at is null order by created_at desc limit 1;
 if not found then select * into selected_entitlement from public.mf_entitlements where user_id=p_user_id and product_id=p_product_id and plan='monthly' and status='active' and starts_at<=activation_time and ends_at>activation_time order by ends_at desc,created_at desc limit 1; end if;
 if not found then select * into selected_entitlement from public.mf_entitlements where user_id=p_user_id and product_id=p_product_id and plan='monthly' and status='pending_activation' order by created_at,id limit 1; end if;
 if not found then return null; end if;
 select * into selected_plan from public.mf_product_plans where id=selected_entitlement.plan_id and product_id=p_product_id and is_active=true;
 if not found then return null; end if;
 select count(*) into active_devices from public.mf_license_devices where user_id=p_user_id and product_id=p_product_id and revoked_at is null;
 select revoked_at into existing_revoked_at from public.mf_license_devices where user_id=p_user_id and product_id=p_product_id and device_hash=p_device_hash for update;
 if found then
  if existing_revoked_at is not null then return null; end if;
  if active_devices>selected_entitlement.device_limit and not exists(select 1 from (select device_hash from public.mf_license_devices where user_id=p_user_id and product_id=p_product_id and revoked_at is null order by first_seen_at,id limit selected_entitlement.device_limit) permitted where permitted.device_hash=p_device_hash) then return null; end if;
  update public.mf_license_devices set last_seen_at=activation_time where user_id=p_user_id and product_id=p_product_id and device_hash=p_device_hash;
 else
  if active_devices>=selected_entitlement.device_limit then return null; end if;
  insert into public.mf_license_devices(user_id,product_id,device_hash,first_seen_at,last_seen_at) values(p_user_id,p_product_id,p_device_hash,activation_time,activation_time);
 end if;
 if selected_entitlement.status='pending_activation' then
  if selected_plan.billing_type<>'monthly' or selected_plan.duration_days is null then return null; end if;
  update public.mf_entitlements set status='active',starts_at=activation_time,ends_at=activation_time+make_interval(days=>selected_plan.duration_days),updated_at=activation_time
  where id=selected_entitlement.id and user_id=p_user_id and product_id=p_product_id and status='pending_activation' returning * into selected_entitlement;
  if not found then return null; end if;
 end if;
 return jsonb_build_object('id',selected_entitlement.id,'product_id',selected_entitlement.product_id,'plan',selected_entitlement.plan,'plan_id',selected_entitlement.plan_id,
 'status',selected_entitlement.status,'starts_at',selected_entitlement.starts_at,'ends_at',selected_entitlement.ends_at,'device_limit',selected_entitlement.device_limit,'created_at',selected_entitlement.created_at);
end; $$;

create or replace function public.mf_admin_list_products()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception using errcode='42501',message='Service authorization required.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'slug',p.slug,'name',p.name,'description',p.description,'websiteUrl',p.website_url,
 'supportWhatsapp',p.support_whatsapp,'content',p.content,'status',p.status,'createdAt',p.created_at,
 'plans',coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'code',pp.code,'displayName',pp.display_name,'amountMinor',pp.amount_minor,
 'currency',pp.currency,'billingType',pp.billing_type,'durationDays',pp.duration_days,'deviceLimit',pp.device_limit,'isActive',pp.is_active) order by pp.amount_minor)
 from public.mf_product_plans pp where pp.product_id=p.id),'[]'::jsonb)) order by p.created_at desc) from public.mf_products p),'[]'::jsonb);
end; $$;

alter table public.mf_security_events drop constraint mf_security_events_event_type_check;
alter table public.mf_security_events add constraint mf_security_events_event_type_check check(event_type in(
 'login_success','login_failed','checkout_started','checkout_abandoned','whatsapp_opened','license_validate','license_denied',
 'device_registered','device_limit_hit','entitlement_revoked','account_suspended','admin_action','suspicious_activity'));
