-- Applied to mfplugin-staging as migration 20261108163435.
create table public.mf_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '',
  website_url text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.mf_product_plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.mf_products(id) on delete restrict,
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  amount_minor integer not null check (amount_minor >= 0),
  currency char(3) not null default 'EGP' check (currency = upper(currency)),
  billing_type text not null check (billing_type in ('monthly','lifetime','one_time')),
  duration_days integer,
  device_limit smallint not null default 1 check (device_limit between 1 and 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mf_product_plans_duration_check check (
    (billing_type='monthly' and duration_days between 1 and 366) or
    (billing_type in ('lifetime','one_time') and duration_days is null)
  ),
  constraint mf_product_plans_product_code_key unique(product_id,code),
  constraint mf_product_plans_id_product_key unique(id,product_id)
);
insert into public.mf_products(slug,name,description,website_url,status)
values('mf-plugin','MF Plugin','Adobe Premiere Pro extension and its connected licensing service.','https://mf.mahmoudmostafa.online/','active')
on conflict(slug) do update set name=excluded.name,description=excluded.description,website_url=excluded.website_url,status='active',updated_at=now();
insert into public.mf_product_plans(product_id,code,display_name,amount_minor,currency,billing_type,duration_days,device_limit,is_active)
select p.id,v.code,v.display_name,v.amount_minor,'EGP',v.billing_type,v.duration_days,1,true
from public.mf_products p
cross join (values('monthly','Monthly',35000,'monthly',30),('lifetime','Lifetime',150000,'lifetime',null)) v(code,display_name,amount_minor,billing_type,duration_days)
where p.slug='mf-plugin'
on conflict(product_id,code) do update set display_name=excluded.display_name,amount_minor=excluded.amount_minor,currency=excluded.currency,billing_type=excluded.billing_type,duration_days=excluded.duration_days,device_limit=excluded.device_limit,is_active=true,updated_at=now();

alter table public.mf_entitlements add column product_id uuid, add column plan_id uuid;
alter table public.mf_license_orders add column product_id uuid, add column plan_id uuid;
alter table public.mf_license_devices add column product_id uuid;
update public.mf_entitlements e set product_id=p.id,plan_id=pp.id from public.mf_products p join public.mf_product_plans pp on pp.product_id=p.id where p.slug='mf-plugin' and pp.code=e.plan;
update public.mf_license_orders o set product_id=p.id,plan_id=pp.id from public.mf_products p join public.mf_product_plans pp on pp.product_id=p.id where p.slug='mf-plugin' and pp.code=o.plan;
update public.mf_license_devices d set product_id=p.id from public.mf_products p where p.slug='mf-plugin';
alter table public.mf_entitlements alter column product_id set not null,alter column plan_id set not null,
 add constraint mf_entitlements_product_id_fkey foreign key(product_id) references public.mf_products(id) on delete restrict,
 add constraint mf_entitlements_plan_product_fkey foreign key(plan_id,product_id) references public.mf_product_plans(id,product_id) on delete restrict;
alter table public.mf_license_orders alter column product_id set not null,alter column plan_id set not null,
 add constraint mf_license_orders_product_id_fkey foreign key(product_id) references public.mf_products(id) on delete restrict,
 add constraint mf_license_orders_plan_product_fkey foreign key(plan_id,product_id) references public.mf_product_plans(id,product_id) on delete restrict;
alter table public.mf_license_devices alter column product_id set not null,
 add constraint mf_license_devices_product_id_fkey foreign key(product_id) references public.mf_products(id) on delete restrict;
alter table public.mf_license_admin_audit add column product_id uuid references public.mf_products(id) on delete set null;

create or replace function public.mf_set_product_plan_refs()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare selected_product_id uuid; selected_plan_id uuid;
begin
 if new.product_id is null then
  select id into selected_product_id from public.mf_products where slug='mf-plugin' and status='active';
  new.product_id:=selected_product_id;
 end if;
 select id into selected_plan_id from public.mf_product_plans where product_id=new.product_id and code=new.plan and is_active=true;
 if new.product_id is null then raise exception 'A valid product is required.'; end if;
 if selected_plan_id is null then raise exception 'The selected plan is not active for this product.'; end if;
 new.plan_id:=selected_plan_id;
 return new;
end; $$;
create or replace function public.mf_set_device_product_ref()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare selected_product_id uuid;
begin
 if new.product_id is null then
  select id into selected_product_id from public.mf_products where slug='mf-plugin' and status='active';
  new.product_id:=selected_product_id;
 end if;
 if new.product_id is null then raise exception 'A valid product is required.'; end if;
 return new;
end; $$;
create trigger mf_entitlements_product_plan_ref before insert or update of product_id,plan on public.mf_entitlements for each row execute function public.mf_set_product_plan_refs();
create trigger mf_license_orders_product_plan_ref before insert or update of product_id,plan on public.mf_license_orders for each row execute function public.mf_set_product_plan_refs();
create trigger mf_license_devices_product_ref before insert or update of product_id on public.mf_license_devices for each row execute function public.mf_set_device_product_ref();

alter table public.mf_license_orders drop constraint mf_license_orders_plan_check;
alter table public.mf_license_orders add constraint mf_license_orders_plan_check check(plan in ('monthly','lifetime'));
drop index public.mf_license_orders_one_open_per_account_uidx;
create unique index mf_license_orders_one_open_per_account_product_uidx on public.mf_license_orders(account_id,product_id) where status in ('uploading','pending');
drop index public.mf_entitlements_one_pending_monthly_uidx;
create unique index mf_entitlements_one_pending_monthly_product_uidx on public.mf_entitlements(user_id,product_id) where plan='monthly' and status='pending_activation';
alter table public.mf_license_devices drop constraint mf_license_devices_user_id_device_hash_key;
create unique index mf_license_devices_user_product_device_key on public.mf_license_devices(user_id,product_id,device_hash);
create index mf_entitlements_product_status_idx on public.mf_entitlements(product_id,status,ends_at);
create index mf_license_orders_product_status_created_idx on public.mf_license_orders(product_id,status,created_at desc);
create index mf_license_devices_product_last_seen_idx on public.mf_license_devices(product_id,last_seen_at desc);
create index mf_license_admin_audit_product_created_idx on public.mf_license_admin_audit(product_id,created_at desc);

create table public.mf_checkout_leads (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.mf_products(id) on delete restrict,
 full_name text,email text,phone text,
 locale text not null default 'ar' check(locale in ('ar','en')),
 source text not null default 'website' check(length(btrim(source)) between 1 and 80),
 status text not null default 'new' check(status in ('new','contacted','checkout_started','converted','lost')),
 marketing_consent boolean not null default false,consent_at timestamptz,privacy_notice_version text,
 first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),
 converted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint mf_checkout_leads_contact_check check(nullif(btrim(coalesce(email,'')),'') is not null or nullif(btrim(coalesce(phone,'')),'') is not null),
 constraint mf_checkout_leads_email_length_check check(email is null or length(email)<=254),
 constraint mf_checkout_leads_phone_length_check check(phone is null or length(phone)<=32),
 constraint mf_checkout_leads_name_length_check check(full_name is null or length(full_name)<=120)
);
create table public.mf_checkout_sessions (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.mf_products(id) on delete restrict,
 plan_id uuid references public.mf_product_plans(id) on delete set null,
 lead_id uuid references public.mf_checkout_leads(id) on delete set null,
 account_id uuid references auth.users(id) on delete set null,
 order_id uuid references public.mf_license_orders(id) on delete set null,
 status text not null default 'started' check(status in ('started','contact_submitted','whatsapp_opened','order_pending','converted','abandoned','expired')),
 source text not null default 'website',
 last_seen_at timestamptz not null default now(),whatsapp_clicked_at timestamptz,
 abandoned_at timestamptz,converted_at timestamptz,
 expires_at timestamptz not null default(now()+interval '30 days'),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.mf_security_events (
 id bigint generated always as identity primary key,
 product_id uuid references public.mf_products(id) on delete set null,
 account_id uuid references auth.users(id) on delete set null,
 event_type text not null check(event_type in ('login_success','login_failed','checkout_started','whatsapp_opened','license_validate','license_denied','device_registered','device_limit_hit','entitlement_revoked','account_suspended','admin_action','suspicious_activity')),
 ip_address inet,device_hash text check(device_hash is null or device_hash ~ '^[0-9a-f]{64}$'),
 user_agent text check(user_agent is null or length(user_agent)<=1024),
 request_id text check(request_id is null or length(request_id)<=128),
 risk_score smallint not null default 0 check(risk_score between 0 and 100),
 details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
 created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '90 days')
);
create index mf_checkout_leads_product_status_created_idx on public.mf_checkout_leads(product_id,status,created_at desc);
create index mf_checkout_leads_email_lower_idx on public.mf_checkout_leads(lower(email)) where email is not null;
create index mf_checkout_sessions_product_status_activity_idx on public.mf_checkout_sessions(product_id,status,last_seen_at desc);
create index mf_checkout_sessions_lead_idx on public.mf_checkout_sessions(lead_id,created_at desc) where lead_id is not null;
create index mf_security_events_product_created_idx on public.mf_security_events(product_id,created_at desc);
create index mf_security_events_account_created_idx on public.mf_security_events(account_id,created_at desc) where account_id is not null;
create index mf_security_events_ip_created_idx on public.mf_security_events(ip_address,created_at desc) where ip_address is not null;
create index mf_security_events_expiry_idx on public.mf_security_events(expires_at);

alter table public.mf_products enable row level security;
alter table public.mf_product_plans enable row level security;
alter table public.mf_checkout_leads enable row level security;
alter table public.mf_checkout_sessions enable row level security;
alter table public.mf_security_events enable row level security;
revoke all on public.mf_products,public.mf_product_plans,public.mf_checkout_leads,public.mf_checkout_sessions,public.mf_security_events from public,anon,authenticated;
grant all on public.mf_products,public.mf_product_plans,public.mf_checkout_leads,public.mf_checkout_sessions,public.mf_security_events to service_role;
grant usage,select on sequence public.mf_security_events_id_seq to service_role;
revoke all on function public.mf_set_product_plan_refs() from public,anon,authenticated;
revoke all on function public.mf_set_device_product_ref() from public,anon,authenticated;
