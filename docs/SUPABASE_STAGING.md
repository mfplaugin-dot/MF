# MF Central Platform — Supabase Staging

## Environment boundary

- Staging project: `mfplugin-staging` — `bgyplclmucmkmajilhhs` (region `eu-west-2`).
- Production project: `mfplugin` — `ymrvwzdqbaaodnozkgcm`.
- Historical Staging checks and deployments documented below targeted **Staging only**. The latest CLI deployment attempt could not authenticate, so do not treat local Edge Function edits as deployed.
- Do not link, push migrations, deploy functions, rotate secrets, or change Auth settings on Production during development.
- Keep Production untouched until the owner explicitly approves a separately reviewed release plan.

## Product catalog seeded in Staging

- Product slug: `mf-plugin`
- Display name: `MF Plugin`
- Website: `https://mf.mahmoudmostafa.online/`
- Monthly: EGP 350, 30 days, 1 active device.
- Lifetime: EGP 1,500, no expiry, 1 active device.

Amounts are stored as EGP minor units (piastres): 35000 and 150000.

## Central schema added

- `mf_products`, `mf_product_plans`: multi-product catalog, editable WhatsApp support contact, structured product content, price/device rules.
- `mf_checkout_leads`: contactable prospects and consent metadata.
- `mf_checkout_sessions`: checkout progress, WhatsApp clicks, conversion/abandonment states.
- `mf_security_events`: product/account/device/IP/user-agent events. IP expiry is marked at 90 days; no automatic purge schedule is configured yet.
- Existing `mf_entitlements`, `mf_license_orders`, and `mf_license_devices` now carry product/plan references. Existing records were mapped to `mf-plugin`.
- Orders snapshot the amount/currency at purchase time; entitlements snapshot the device limit so later catalog edits do not silently change existing purchases.
- RLS is enabled on new tables. Public and authenticated direct access is denied; server access is through service-role Edge Functions only.
- RPCs added for product order creation/review, admin overview, lead/event/product listings, product-specific grant, device revocation, and device activation.

## Scheduled maintenance

- `mf-platform-maintenance` runs every 15 minutes: marks expired monthly entitlements, stale unsubmitted receipt orders, and abandoned checkout sessions.
- `mf-cron-history-cleanup` removes Cron run history older than 7 days daily.
- IP/security-event records are **not** automatically deleted; the 90-day expiry timestamp is a review/retention marker pending an approved privacy policy.

## Staging Edge Functions — last known remote state

### `mf-platform` (last known version 6, verify_jwt=false)

Public:
- `GET /functions/v1/mf-platform/catalog` (returns active product plans, product copy, and WhatsApp contact)
- `POST /functions/v1/mf-platform/lead`
- `POST /functions/v1/mf-platform/checkout/session`
- `POST /functions/v1/mf-platform/checkout/whatsapp-click`
- `POST /functions/v1/mf-platform/checkout/abandon`

Authenticated customer:
- `POST /functions/v1/mf-platform/order/create`
- `POST /functions/v1/mf-platform/order/receipt`
- `POST /functions/v1/mf-platform/order/status`
- `POST /functions/v1/mf-platform/order/list`
- `POST /functions/v1/mf-platform/order/message`

Admin (requires Supabase Auth user with `app_metadata.role = admin`; local source includes the routes below, but deployment of the latest source is pending):
- `POST /functions/v1/mf-platform/admin/overview`
- `POST /functions/v1/mf-platform/admin/products`
- `POST /functions/v1/mf-platform/admin/save-product`
- `POST /functions/v1/mf-platform/admin/save-plan`
- `POST /functions/v1/mf-platform/admin/leads`
- `POST /functions/v1/mf-platform/admin/update-lead`
- `POST /functions/v1/mf-platform/admin/security-events`
- `POST /functions/v1/mf-platform/admin/accounts`
- `POST /functions/v1/mf-platform/admin/orders`
- `POST /functions/v1/mf-platform/admin/inspect`
- `POST /functions/v1/mf-platform/admin/review-order`
- `POST /functions/v1/mf-platform/admin/order-messages`
- `POST /functions/v1/mf-platform/admin/send-order-message`
- `POST /functions/v1/mf-platform/admin/grant-entitlement`
- `POST /functions/v1/mf-platform/admin/revoke-entitlement`
- `POST /functions/v1/mf-platform/admin/revoke-device`
- `POST /functions/v1/mf-platform/admin/suspend-account`
- `POST /functions/v1/mf-platform/admin/reactivate-account`

### `mf-license` (version 4, verify_jwt=true)

- `POST /functions/v1/mf-license/validate`
- Requires a Supabase user JWT and a 64-character lowercase SHA-256 device hash.
- Optional `productSlug`; defaults to `mf-plugin`.
- Resolves product-specific entitlements and device limits server-side.
- Signs Ed25519 entitlement claims. Private signing key remains server-side.
- CORS remains wildcard for this extension-facing endpoint because the Premiere/CEP runtime origin may not be the website domain; JWT verification and server-side entitlement/device checks are the security boundary.
- Logs successful/denied validation and device-limit events with IP metadata.

## Important remaining integration work

1. The Vite website now uses Supabase Auth and `mf-platform`; the legacy Azure API remains intact for rollback/reference and is not the website source of truth.
2. The latest local source adds authenticated `order/list`, customer password recovery, a privacy-notice gate, required account-status reasons, and expanded admin tools including customer support messages. These local changes are **not deployed** to Staging; a live smoke test returned 404 for `order/list`.
3. The local Supabase CLI state is inaccessible from this sandbox. Restore CLI access in a trusted local session, verify the exact Staging project ref, then deploy only the explicitly authorized function. Do not paste tokens into chat.
4. No owner Auth account has been verified for promotion. Verify the owner's identity before assigning `app_metadata.role = admin`; do not promote test accounts.
5. Custom SMTP, sender/domain verification, recovery URLs, and leaked-password protection remain unverified. The website now supports reset requests, but signup/recovery delivery cannot be claimed until SMTP is configured and tested.
6. Checkout is blocked unless approved privacy-notice text and version are configured in each product's structured content. The actual legal notice and retention policy require owner approval.
7. The Vite artifact workflow is preview-only. The existing Jekyll workflow and live custom domain remain unchanged.
8. The installed Premiere extension has product/device-bound signed-entitlement checks, but no real Premiere login, activation, download, or timeline test was completed.
9. IP/security-event expiry is only a marker; no automatic deletion is configured. Do not schedule deletion before an approved policy.

## Current live Staging smoke checks

Read-only requests made to `bgyplclmucmkmajilhhs` during the latest local
verification:

- `GET /functions/v1/mf-platform/catalog`: HTTP 200; one active MF Plugin
  product, Monthly EGP 350 / 30 days / one device, and Lifetime EGP 1,500 /
  no expiry / one device.
- Anonymous `POST /functions/v1/mf-platform/admin/overview`: HTTP 401
  (`Sign-in required`).
- Anonymous `POST /functions/v1/mf-license/validate`: HTTP 401 because no
  Authorization header was supplied.
- Anonymous PostgREST read of `mf_license_orders`: HTTP 401.
- `POST /functions/v1/mf-platform/order/list`: HTTP 404 (`Unknown platform
  operation`), confirming the latest local `mf-platform` has not been deployed.
- An anonymous Storage list probe returned HTTP 400 and did not provide a
  conclusive authorization result; private receipt access still needs the
  read-only schema/policy check or an authenticated customer-isolation test.

These requests did not create accounts/orders, change database state, or
modify Auth, Storage, functions, or migrations. The current CLI session cannot
deploy from this sandbox because its local Supabase CLI state is inaccessible.

The new local migration
`20261108200000_mf_admin_account_status_reason.sql` is not applied. It adds
the reason-bearing account-status RPC expected by the local functions. Do not
apply it independently of a compatible function rollout: the older deployed
`mf-license` may still call the previous RPC signature.

## CLI and migration safety

Supabase CLI v3 changed to local-first behavior. Always inspect `supabase --version` and `supabase --help`; pin the version used in CI. Use explicit Staging project ref for every remote operation. Never use the Production ref in a command during this phase.

The Staging database already contains prior remote migration history. Before running `supabase db push`, reconcile all remote migration versions with the repository. Do not reset or push a partial migration history. Use the Supabase CLI local workflow, pull/repair the existing baseline carefully, inspect the generated diff, and verify with `supabase migration list --remote`.

## Verification snapshot

- Staging project status: ACTIVE_HEALTHY.
- New product catalog: 1 product, 2 plans; monthly EGP 350/30 days and Lifetime EGP 1,500/no expiry, both one device.
- Order message read/write SQL smoke test passed in a rolled-back transaction.
- Product-specific activation and grant RPCs use the product's own entitlement and device limit; entitlement device limits and order prices are snapshotted.
- Product content and WhatsApp support contact are stored with the product catalog and exposed through the public catalog endpoint.
- Existing rows mapped: 4 entitlements, 2 orders, 3 devices; no missing product/plan references.
- New tables have RLS enabled and explicit deny policies for anon/authenticated.
- SQL smoke tests passed inside rolled-back transactions for admin overview/catalog/leads/security RPCs, order creation, lifetime order review, product-specific grant, and device activation.
- Cron schedule verified active: maintenance every 15 minutes; cron history cleanup daily at 03:00 UTC.
- Order price snapshots verified: 35000 minor EGP for Monthly and 150000 minor EGP for Lifetime.
- Supabase security advisor after policy changes: only remaining warning is leaked-password protection disabled.
- Performance advisor: no missing-FK-index finding; unused-index INFO notices are expected for newly created indexes before production traffic.
- Supabase CLI deployment of the latest `mf-platform` source failed because the CLI was unauthenticated; no migration or remote function write was completed in that attempt.
- Latest local checks: website `npm ci` and production build passed; legacy API tests passed (5/5); installed plugin tests passed (80/80); repository Edge Functions and the Staging-copy license function passed `deno check`. The local production preview server started, but browser and HTTP requests could not connect to its sandbox-local port.
- Live Staging read-only smoke tests passed for the public catalog, anonymous admin rejection, anonymous license validation rejection, and direct anonymous order-table denial. The missing `order/list` route is a deployment blocker. Receipt-bucket authorization was inconclusive in the latest HTTP probe.
- No migration was applied during the current integration work. The original five migration sources remain absent from this repository; reconcile history before any future `db push`.
