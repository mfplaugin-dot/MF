-- Applied to mfplugin-staging as migration 20261108163525.
create index if not exists mf_account_controls_updated_by_idx on public.mf_account_controls(updated_by);
create index if not exists mf_checkout_sessions_account_id_idx on public.mf_checkout_sessions(account_id);
create index if not exists mf_checkout_sessions_order_id_idx on public.mf_checkout_sessions(order_id);
create index if not exists mf_checkout_sessions_plan_product_idx on public.mf_checkout_sessions(plan_id,product_id);
create index if not exists mf_entitlements_granted_by_idx on public.mf_entitlements(granted_by);
create index if not exists mf_entitlements_plan_product_idx on public.mf_entitlements(plan_id,product_id);
create index if not exists mf_license_admin_audit_actor_idx on public.mf_license_admin_audit(actor_user_id);
create index if not exists mf_license_admin_audit_entitlement_idx on public.mf_license_admin_audit(entitlement_id);
create index if not exists mf_license_admin_audit_target_idx on public.mf_license_admin_audit(target_user_id);
create index if not exists mf_license_admin_audit_order_idx on public.mf_license_admin_audit(order_id);
create index if not exists mf_license_orders_account_id_idx on public.mf_license_orders(account_id);
create index if not exists mf_license_orders_reviewed_by_idx on public.mf_license_orders(reviewed_by);
create index if not exists mf_license_orders_plan_product_idx on public.mf_license_orders(plan_id,product_id);

alter table public.mf_checkout_sessions drop constraint mf_checkout_sessions_plan_id_fkey,
 add constraint mf_checkout_sessions_plan_product_fkey foreign key(plan_id,product_id)
 references public.mf_product_plans(id,product_id) on delete set null;

create policy "MF product catalog is server-only" on public.mf_products for all to anon,authenticated using(false) with check(false);
create policy "MF product plans are server-only" on public.mf_product_plans for all to anon,authenticated using(false) with check(false);
create policy "MF checkout leads are server-only" on public.mf_checkout_leads for all to anon,authenticated using(false) with check(false);
create policy "MF checkout sessions are server-only" on public.mf_checkout_sessions for all to anon,authenticated using(false) with check(false);
create policy "MF security events are server-only" on public.mf_security_events for all to anon,authenticated using(false) with check(false);

drop policy if exists "Users can read their own MF entitlements" on public.mf_entitlements;
create policy "Users can read their own MF entitlements" on public.mf_entitlements for select to authenticated using((select auth.uid())=user_id);
drop policy if exists "Users can read their own MF devices" on public.mf_license_devices;
create policy "Users can read their own MF devices" on public.mf_license_devices for select to authenticated using((select auth.uid())=user_id);

create or replace function public.mf_create_product_order(p_account_id uuid,p_product_id uuid,p_plan_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare selected_plan public.mf_product_plans%rowtype; account_status text; created_order_id uuid;
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' or p_account_id is null or p_product_id is null or p_plan_id is null then
  raise exception using errcode='42501',message='Service authorization and valid order details are required.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_account_id::text||':'||p_product_id::text,17411));
 select status into account_status from public.mf_account_controls where user_id=p_account_id;
 if account_status='suspended' then raise exception using errcode='42501',message='This account is suspended.'; end if;
 if not exists(select 1 from auth.users where id=p_account_id) then raise exception using errcode='P0002',message='Account not found.'; end if;
 select pp.* into selected_plan from public.mf_product_plans pp join public.mf_products p on p.id=pp.product_id
 where pp.id=p_plan_id and pp.product_id=p_product_id and pp.is_active=true and p.status='active';
 if not found or selected_plan.code not in('monthly','lifetime') then raise exception using errcode='22023',message='The selected product plan is unavailable.'; end if;
 if selected_plan.code='monthly' and exists(select 1 from public.mf_entitlements where user_id=p_account_id and product_id=p_product_id and plan='lifetime' and status='active' and starts_at<=now() and ends_at is null) then
  raise exception using errcode='P0001',message='MF_LIFETIME_ACTIVE';
 end if;
 if selected_plan.code='monthly' and exists(select 1 from public.mf_entitlements where user_id=p_account_id and product_id=p_product_id and plan='monthly' and status='pending_activation') then
  raise exception using errcode='P0001',message='MF_MONTHLY_PENDING_ACTIVATION';
 end if;
 if selected_plan.code='lifetime' and exists(select 1 from public.mf_entitlements where user_id=p_account_id and product_id=p_product_id and plan='lifetime' and status='active' and starts_at<=now() and ends_at is null) then
  raise exception using errcode='P0001',message='MF_LIFETIME_ALREADY_ACTIVE';
 end if;
 insert into public.mf_license_orders(account_id,plan,status,product_id) values(p_account_id,selected_plan.code,'uploading',p_product_id) returning id into created_order_id;
 return created_order_id;
end; $$;

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
 if selected_plan.code='monthly' and exists(select 1 from public.mf_entitlements where user_id=order_row.account_id and product_id=order_row.product_id and plan='lifetime' and status='active' and starts_at<=review_time and ends_at is null) then
  raise exception using errcode='P0001',message='MF_LIFETIME_ACTIVE';
 end if;
 if selected_plan.code='monthly' and exists(select 1 from public.mf_entitlements where user_id=order_row.account_id and product_id=order_row.product_id and plan='monthly' and status='pending_activation') then
  raise exception using errcode='P0001',message='MF_MONTHLY_PENDING_ACTIVATION';
 end if;
 if selected_plan.code='lifetime' and exists(select 1 from public.mf_entitlements where user_id=order_row.account_id and product_id=order_row.product_id and plan='lifetime' and status='active' and starts_at<=review_time and ends_at is null) then
  raise exception using errcode='P0001',message='MF_LIFETIME_ALREADY_ACTIVE';
 end if;
 insert into public.mf_entitlements(user_id,plan,status,starts_at,ends_at,granted_by,product_id,plan_id)
 values(order_row.account_id,selected_plan.code,case when selected_plan.billing_type='monthly' then 'pending_activation' else 'active' end,
 case when selected_plan.billing_type='monthly' then null else review_time end,null,p_actor_user_id,order_row.product_id,selected_plan.id)
 returning id into created_entitlement_id;
 update public.mf_license_orders set status='approved',reviewed_at=review_time,reviewed_by=p_actor_user_id where id=p_order_id;
 insert into public.mf_license_admin_audit(actor_user_id,target_user_id,action,entitlement_id,order_id,product_id,payment_reference,grant_reason,created_at)
 values(p_actor_user_id,order_row.account_id,'grant-'||selected_plan.code,created_entitlement_id,p_order_id,order_row.product_id,normalized_reference,normalized_reason,review_time);
 return jsonb_build_object('orderId',p_order_id,'status','approved','entitlementId',created_entitlement_id,
 'entitlementStatus',case when selected_plan.billing_type='monthly' then 'pending_activation' else 'active' end);
end; $$;

create or replace function public.mf_admin_platform_overview()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception using errcode='42501',message='Service authorization required.'; end if;
 return jsonb_build_object(
  'customers',(select count(*) from auth.users),
  'activeSubscriptions',(select count(*) from public.mf_entitlements e where e.status='active' and e.starts_at<=now() and (e.ends_at is null or e.ends_at>now())),
  'pendingActivation',(select count(*) from public.mf_entitlements where status='pending_activation'),
  'pendingOrders',(select count(*) from public.mf_license_orders where status='pending'),
  'openLeads',(select count(*) from public.mf_checkout_leads where status in('new','contacted','checkout_started')),
  'abandonedCheckouts',(select count(*) from public.mf_checkout_sessions where status='abandoned'),
  'expiringWithin7Days',(select count(*) from public.mf_entitlements where status='active' and ends_at>now() and ends_at<=now()+interval '7 days'),
  'products',(select count(*) from public.mf_products where status='active')
 );
end; $$;

create or replace function public.mf_admin_list_checkout_leads(p_product_id uuid default null,p_status text default null,p_page integer default 1,p_page_size integer default 25)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare allowed_statuses text[]:=array['new','contacted','checkout_started','converted','lost'];
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' or p_page is null or p_page<1 or p_page>100000
  or p_page_size is null or p_page_size<1 or p_page_size>100
  or (p_status is not null and not(p_status=any(allowed_statuses))) then
  raise exception using errcode='22023',message='Invalid lead listing request.';
 end if;
 return (with matched as(
  select l.id,l.product_id,p.name as product_name,l.full_name,l.email,l.phone,l.locale,l.source,l.status,l.marketing_consent,
   l.consent_at,l.first_seen_at,l.last_seen_at,l.converted_at,l.created_at,l.updated_at
  from public.mf_checkout_leads l join public.mf_products p on p.id=l.product_id
  where (p_product_id is null or l.product_id=p_product_id) and (p_status is null or l.status=p_status)
 ) select jsonb_build_object(
  'leads',coalesce((select jsonb_agg(to_jsonb(page_rows) order by page_rows.created_at desc) from
    (select * from matched order by created_at desc,id limit p_page_size offset ((p_page-1)*p_page_size)) page_rows),'[]'::jsonb),
  'total',(select count(*) from matched),'page',p_page,'pageSize',p_page_size));
end; $$;

create or replace function public.mf_admin_list_security_events(p_product_id uuid default null,p_account_id uuid default null,p_event_type text default null,p_page integer default 1,p_page_size integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' or p_page is null or p_page<1 or p_page>100000
  or p_page_size is null or p_page_size<1 or p_page_size>100 or (p_event_type is not null and length(p_event_type)>64) then
  raise exception using errcode='22023',message='Invalid security event listing request.';
 end if;
 return (with matched as(
  select e.id,e.product_id,p.slug as product_slug,e.account_id,e.event_type,host(e.ip_address) as ip_address,
   e.device_hash,e.user_agent,e.request_id,e.risk_score,e.details,e.created_at,e.expires_at
  from public.mf_security_events e left join public.mf_products p on p.id=e.product_id
  where (p_product_id is null or e.product_id=p_product_id) and (p_account_id is null or e.account_id=p_account_id)
   and (p_event_type is null or e.event_type=p_event_type)
 ) select jsonb_build_object(
  'events',coalesce((select jsonb_agg(to_jsonb(page_rows) order by page_rows.created_at desc) from
   (select * from matched order by created_at desc,id desc limit p_page_size offset ((p_page-1)*p_page_size)) page_rows),'[]'::jsonb),
  'total',(select count(*) from matched),'page',p_page,'pageSize',p_page_size));
end; $$;

create or replace function public.mf_admin_list_products()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception using errcode='42501',message='Service authorization required.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',p.id,'slug',p.slug,'name',p.name,'description',p.description,'websiteUrl',p.website_url,'status',p.status,'createdAt',p.created_at,
  'plans',coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'code',pp.code,'displayName',pp.display_name,
   'amountMinor',pp.amount_minor,'currency',pp.currency,'billingType',pp.billing_type,'durationDays',pp.duration_days,
   'deviceLimit',pp.device_limit,'isActive',pp.is_active) order by pp.amount_minor)
   from public.mf_product_plans pp where pp.product_id=p.id),'[]'::jsonb)
 ) order by p.created_at desc) from public.mf_products p),'[]'::jsonb);
end; $$;

revoke all on function public.mf_create_product_order(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.mf_create_product_order(uuid,uuid,uuid) to service_role;
revoke all on function public.mf_admin_review_product_order(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.mf_admin_review_product_order(uuid,uuid,text,text,text) to service_role;
revoke all on function public.mf_admin_platform_overview() from public,anon,authenticated;
grant execute on function public.mf_admin_platform_overview() to service_role;
revoke all on function public.mf_admin_list_checkout_leads(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.mf_admin_list_checkout_leads(uuid,text,integer,integer) to service_role;
revoke all on function public.mf_admin_list_security_events(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.mf_admin_list_security_events(uuid,uuid,text,integer,integer) to service_role;
revoke all on function public.mf_admin_list_products() from public,anon,authenticated;
grant execute on function public.mf_admin_list_products() to service_role;
