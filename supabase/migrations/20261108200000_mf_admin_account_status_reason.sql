-- Require an auditable reason for both suspending and reactivating accounts.
create or replace function public.mf_admin_set_account_status(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_status text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_status text;
  audit_action text;
  normalized_reason text := nullif(btrim(p_reason), '');
begin
  if coalesce(auth.role(), '') <> 'service_role'
     or p_actor_user_id is null or p_target_user_id is null
     or p_status is null or p_status not in ('active', 'suspended')
     or normalized_reason is null or length(normalized_reason) > 500 then
    raise exception using errcode = '22023', message = 'A valid account status and administrator reason are required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_target_user_id::text, 17411));
  perform 1 from auth.users where id = p_target_user_id for update;
  if not found then return false; end if;

  select coalesce(status, 'active') into current_status
    from public.mf_account_controls where user_id = p_target_user_id;
  if not found then current_status := 'active'; end if;
  if current_status = p_status then return true; end if;

  insert into public.mf_account_controls(user_id, status, updated_by, updated_at)
    values (p_target_user_id, p_status, p_actor_user_id, now())
  on conflict (user_id) do update
    set status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  audit_action := case when p_status = 'suspended' then 'suspend-account' else 'reactivate-account' end;
  insert into public.mf_license_admin_audit(actor_user_id, target_user_id, action, reason)
    values (p_actor_user_id, p_target_user_id, audit_action, normalized_reason);
  return true;
end;
$$;

-- The legacy overload cannot alter account status without the required reason.
revoke all on function public.mf_admin_set_account_status(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.mf_admin_set_account_status(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mf_admin_set_account_status(uuid, uuid, text, text)
  to service_role;
