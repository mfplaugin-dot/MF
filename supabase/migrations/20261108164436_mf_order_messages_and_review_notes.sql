-- Applied to mfplugin-staging as migration 20261108164436.
alter table public.mf_license_orders add column review_note text;
create table public.mf_order_messages (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.mf_license_orders(id) on delete cascade,
 sender_user_id uuid references auth.users(id) on delete set null,
 sender_role text not null check(sender_role in('customer','admin')),
 message text not null check(length(btrim(message)) between 1 and 1000),
 created_at timestamptz not null default now()
);
create index mf_order_messages_order_created_idx on public.mf_order_messages(order_id,created_at asc);
alter table public.mf_order_messages enable row level security;
revoke all on public.mf_order_messages from public,anon,authenticated;
grant all on public.mf_order_messages to service_role;
create policy "MF order messages are server-only" on public.mf_order_messages for all to anon,authenticated using(false) with check(false);
create or replace function public.mf_sync_order_review_note()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.order_id is not null then
  update public.mf_license_orders set review_note=coalesce(nullif(btrim(new.reason),''),nullif(btrim(new.grant_reason),'')),reviewed_at=coalesce(reviewed_at,new.created_at)
  where id=new.order_id;
 end if;
 return new;
end; $$;
create trigger mf_order_audit_review_note after insert on public.mf_license_admin_audit
for each row execute function public.mf_sync_order_review_note();
revoke all on function public.mf_sync_order_review_note() from public,anon,authenticated,service_role;
