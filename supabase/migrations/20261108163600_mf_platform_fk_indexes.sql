-- Applied to mfplugin-staging as migration 20261108163600.
alter table public.mf_checkout_sessions drop constraint mf_checkout_sessions_plan_product_fkey,
 add constraint mf_checkout_sessions_plan_product_fkey foreign key(plan_id,product_id)
 references public.mf_product_plans(id,product_id) on delete restrict;
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
