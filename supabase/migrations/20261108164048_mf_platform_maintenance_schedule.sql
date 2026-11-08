-- Applied to mfplugin-staging as migration 20261108164048.
create extension if not exists pg_cron;

create or replace function public.mf_platform_maintenance_sweep()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare expired_count integer:=0; abandoned_count integer:=0; failed_upload_count integer:=0;
begin
 update public.mf_entitlements set status='expired',updated_at=now()
 where status='active' and ends_at is not null and ends_at<=now();
 get diagnostics expired_count=row_count;
 update public.mf_license_orders set status='upload_failed'
 where status='uploading' and created_at<now()-interval '24 hours';
 get diagnostics failed_upload_count=row_count;
 update public.mf_checkout_sessions s
 set status='abandoned',abandoned_at=coalesce(abandoned_at,now()),updated_at=now()
 where s.status in('started','contact_submitted','whatsapp_opened','order_pending')
  and s.last_seen_at<now()-interval '24 hours'
  and (s.order_id is null or exists(select 1 from public.mf_license_orders o where o.id=s.order_id and o.status in('uploading','upload_failed')));
 get diagnostics abandoned_count=row_count;
 return jsonb_build_object('expiredEntitlements',expired_count,'failedReceiptUploads',failed_upload_count,
  'abandonedCheckouts',abandoned_count,'ranAt',now());
end; $$;

revoke all on function public.mf_platform_maintenance_sweep() from public,anon,authenticated,service_role;
grant execute on function public.mf_platform_maintenance_sweep() to postgres;

select cron.schedule('mf-platform-maintenance','*/15 * * * *','select public.mf_platform_maintenance_sweep();');
select cron.schedule('mf-cron-history-cleanup','0 3 * * *',
 $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
