-- Applied to mfplugin-staging as migration 20261108163617.
create policy "MF account controls are server-only" on public.mf_account_controls
for all to anon,authenticated using(false) with check(false);
create policy "MF license audit is server-only" on public.mf_license_admin_audit
for all to anon,authenticated using(false) with check(false);
create policy "MF license orders are server-only" on public.mf_license_orders
for all to anon,authenticated using(false) with check(false);
create policy "MF rate limits are server-only" on public.mf_license_rate_limits
for all to anon,authenticated using(false) with check(false);
