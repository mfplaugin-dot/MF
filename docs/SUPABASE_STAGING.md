# MF Central Platform — Supabase Staging

## Environment boundary

- Staging project: `mfplugin-staging` — `bgyplclmucmkmajilhhs` (region `eu-west-2`).
- Production project: `mfplugin` — `ymrvwzdqbaaodnozkgcm`.
- All schema changes and Edge Function deployments described here were made to **Staging only**.
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

## Staging Edge Functions

### `mf-platform` (version 5, verify_jwt=false)

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

Admin (requires Supabase Auth user with `app_metadata.role = admin`):
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

1. The current Vite website still calls the legacy Azure API through `services/web/src/api.ts`. Replace that adapter with Supabase Auth + `mf-platform` calls; do not leave two sources of truth.
2. Wire the visible website purchase form, WhatsApp click, customer order status, and admin dashboard to these endpoints.
3. Create/confirm the owner's Auth user, then assign `app_metadata.role = admin` securely from a trusted admin context. No account matching the previously specified owner email was present in Staging during this pass; only E2E test users were found. Do not promote an arbitrary user.
4. Configure and test SMTP / account recovery. Leaked-password protection is currently disabled in Staging Auth.
5. The website must be built from `services/web` using Vite and published to the existing custom domain. Review the Pages workflow before changing it; do not replace the live site blindly.
6. Add scheduled cleanup for expired security events and checkout sessions after an approved privacy-retention policy. The database currently marks IP event expiry at 90 days but does not automatically delete records.
7. Update `mf-license` consumers in the actual Premiere plugin so the request sends the correct product slug and the plugin verifies the returned signed claims (including product and device binding).
8. Complete browser, API, Deno, build, security, and real Premiere Pro end-to-end tests before calling this release-ready.

## CLI and migration safety

Supabase CLI v3 changed to local-first behavior. Always inspect `supabase --version` and `supabase --help`; pin the version used in CI. Use explicit Staging project ref for every remote operation. Never use the Production ref in a command during this phase.

The Staging database already contains prior remote migration history. Before running `supabase db push`, reconcile all remote migration versions with the repository. Do not reset or push a partial migration history. Use the Supabase CLI local workflow, pull/repair the existing baseline carefully, inspect the generated diff, and verify with `supabase migration list --remote`.

## Verification snapshot

- Staging project status: ACTIVE_HEALTHY.
- New product catalog: 1 product, 2 plans; monthly EGP 350/30 days and Lifetime EGP 1,500/no expiry, both one device.
- Product-specific activation and grant RPCs use the product's own entitlement and device limit; entitlement device limits and order prices are snapshotted.
- Product content and WhatsApp support contact are stored with the product catalog and exposed through the public catalog endpoint.
- Existing rows mapped: 4 entitlements, 2 orders, 3 devices; no missing product/plan references.
- New tables have RLS enabled and explicit deny policies for anon/authenticated.
- SQL smoke tests passed inside rolled-back transactions for admin overview/catalog/leads/security RPCs, order creation, lifetime order review, product-specific grant, and device activation.
- Cron schedule verified active: maintenance every 15 minutes; cron history cleanup daily at 03:00 UTC.
- Order price snapshots verified: 35000 minor EGP for Monthly and 150000 minor EGP for Lifetime.
- Supabase security advisor after policy changes: only remaining warning is leaked-password protection disabled.
- Performance advisor: no missing-FK-index finding; unused-index INFO notices are expected for newly created indexes before production traffic.
- No browser invocation test or Premiere runtime test was available in this environment. Edge Function deployment status is ACTIVE, but client integration and end-to-end testing remain outstanding.
