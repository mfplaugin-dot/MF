# VS Code Handoff Prompt — MF Plugin Central Platform

You are taking over an existing MF Plugin project. Work as a senior full-stack engineer, Supabase/Postgres security engineer, and Adobe Premiere Pro extension engineer. Your job is to finish the integration and produce a testable release candidate. Do not assume that the work described below is already complete.

## 1. Repository and branch

- Repository: `mfplaugin-dot/MF`
- Continue on branch: `mf-staging-completion`
- Existing Draft PR: `https://github.com/mfplaugin-dot/MF/pull/1`
- Current website: `https://mf.mahmoudmostafa.online/`
- New brand name: **MF Plugin**. Remove "by Mahmoud Mostafa" from product branding where it appears. Do not change DNS or assume `mfplugin.online` is owned. Keep the current domain until the owner explicitly confirms a new domain.
- There are duplicate/legacy project folders. Inspect the repository carefully. The current Vite source is under `services/web`; `services/api` is the legacy Azure API. Do not blindly treat `_MF-Project` or root prebuilt assets as the active source of truth. Document which files are canonical.

## 2. Environment safety — non-negotiable

- Supabase Staging project ref: `bgyplclmucmkmajilhhs`.
- Supabase Production project ref: `ymrvwzdqbaaodnozkgcm`.
- All development, schema changes, Edge Function deployments, and tests must target **Staging only**.
- Never run a command against Production. Never use the Production project ref in a CLI command.
- Do not merge PR #1, deploy the live website, change DNS, reset a database, delete customer data, rotate production secrets, or change Production Auth settings.
- Do not run `supabase db reset`, destructive SQL, or `supabase db push` until you have reconciled local and remote migration history and reviewed the exact diff.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, signing private keys, Azure credentials, or any server secret in frontend code, logs, screenshots, or Git.
- Do not auto-approve payments. Payment is manual: an admin must independently verify the transfer before approving an order.
- If a credential, owner identity, signing key, SMTP value, domain ownership proof, or payment detail is missing, stop and ask the owner. Never invent it.

## 3. Existing Staging backend already implemented

Staging currently has 14 recorded migrations: five original migrations and nine new platform migrations. The nine new migration files are in `supabase/migrations`. The original five remote migration files are not currently present in this repository; recover/reconcile that baseline before attempting a remote push.

New schema includes:
- `mf_products` and `mf_product_plans`: multi-product catalog, plan prices, billing terms, device limits, product description/content, website URL, and WhatsApp support contact.
- `mf_checkout_leads`: contactable prospects and consent metadata.
- `mf_checkout_sessions`: checkout progression, WhatsApp click, conversion, abandonment.
- `mf_security_events`: product/account/device/IP/user-agent events. IP records have a 90-day expiry marker; there is currently no automatic deletion of these records because the retention/privacy policy needs owner approval.
- `mf_order_messages`: customer/admin order messages.
- Existing `mf_entitlements`, `mf_license_orders`, and `mf_license_devices` now reference products/plans. Orders snapshot purchase amount/currency. Entitlements snapshot device limits.

Seeded Staging product:
- Slug: `mf-plugin`
- Monthly: EGP 350, 30 days, one device.
- Lifetime: EGP 1,500, no expiry, one device.
- WhatsApp support number currently stored on the product row: `201016022870`. Treat this as editable catalog data; do not hardcode it into new UI components.

Staging Edge Functions:
- `mf-platform` version 6, `verify_jwt=false`. This is intentional because it serves public catalog/lead/checkout endpoints; all admin/customer protected routes manually validate Supabase Auth JWTs. Admin requires `app_metadata.role === "admin"`.
- `mf-license` version 4, `verify_jwt=true`. It validates product-scoped entitlements and devices and signs Ed25519 entitlement claims. Its wildcard CORS is intentional for Premiere/CEP extension origins; JWT validation and server-side checks are the security boundary.

The Edge Function source is committed under `supabase/functions/`. Function configuration is in `supabase/config.toml`.

### Existing `mf-platform` endpoints

Public:
- `GET /functions/v1/mf-platform/catalog`
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

Admin:
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

License:
- `POST /functions/v1/mf-license/validate`
- Requires an authenticated Supabase user JWT, a 64-character lowercase SHA-256 device hash, and accepts `productSlug` (defaults to `mf-plugin`).

## 4. Current known blockers (updated 2026-11-08)

1. The Vite website now calls Supabase Auth and `mf-platform`; the legacy Azure API remains intact only as rollback/reference. Do not remove it until backend parity and an approved rollback plan exist.
2. The local website supports catalog, checkout, account/order history, receipt upload, and admin product/lead/account/security/support modules. The latest `mf-platform` changes, including `order/list`, have not been deployed because the Supabase CLI was unauthenticated.
3. There is no real owner/admin account in Staging. Existing E2E admin accounts have revoked test roles. Do not promote a test account. The owner must create/confirm their real Staging Auth account and then authorize the admin role assignment.
4. SMTP/sender verification and HTTPS recovery redirects are not configured or verified. Staging Auth leaked-password protection is disabled. The website now has a password-reset flow, but email delivery must be tested after SMTP setup.
5. A Vite artifact-only workflow and local production build are ready; the current Jekyll live workflow remains unchanged. Do not publish or switch workflows without approval.
6. The actual CEP extension exists in the local Adobe installation outside this repository. Product/device-bound entitlement checks were updated and plugin tests passed, but interactive Premiere login, activation, download, and timeline insertion were not tested.
7. Order creation is intentionally blocked until an approved privacy notice and version are configured in each product's content. IP/security-event expiry is only a marker; no deletion is scheduled before owner approval.
8. The local Git metadata is inaccessible in the current workspace, so local changes have not been committed or pushed. PR #1 remains Draft; do not bypass the repository's normal Git access controls.

The website's `npm ci` and Vite production build passed. Legacy API tests passed 5/5, plugin tests passed 80/80, and both Edge Functions passed Deno checks. Browser preview could not connect to the local preview server. No Staging migration or latest-function deployment was performed in this phase.

## 5. Frontend integration tasks

### A. Supabase client and configuration
- Add `@supabase/supabase-js` to `services/web` and update the lockfile using the package manager already used by the project.
- Create one typed Supabase client.
- Use only:
  - `VITE_SUPABASE_URL=https://bgyplclmucmkmajilhhs.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY=<Staging publishable/anon key from Supabase dashboard>`
- Never put the service-role key in `VITE_*` variables.
- Keep local development and CI environment variables separate from Production.

### B. Replace the legacy API adapter
- Refactor `services/web/src/api.ts` into a typed adapter for Supabase Auth and `mf-platform`.
- Use Supabase Auth for customer signup/sign-in/sign-out and persist sessions safely.
- Invoke `mf-platform` with the user's access token for protected calls.
- Load product catalog, descriptions, prices, features/FAQ content, and WhatsApp number dynamically from the database.
- Remove duplicate static price/contact sources after a verified database fallback is in place.
- Do not leave Azure and Supabase as competing sources of truth. Keep Azure only during a documented migration/rollback window, then disable it only after parity and approval.

### C. Customer purchase journey
Implement and test this sequence:
1. Visitor loads active catalog.
2. Visitor starts checkout; create a lead when they provide a contact method, with clear privacy notice and separate optional marketing consent.
3. Create a checkout session and track WhatsApp click/abandonment.
4. Customer creates/signs into a Supabase account.
5. Customer creates an order for the chosen product/plan.
6. Customer uploads a PDF/JPEG/PNG receipt (max 5 MB).
7. Customer sees order status, review note, price snapshot, and messages.
8. Admin independently verifies payment and approves/rejects.
9. Approval creates the correct Monthly/Lifetime entitlement; Monthly starts at first successful device activation, Lifetime has no expiry.
10. Customer can see device registrations and subscription expiry/status.

Do not mark a lead converted just because WhatsApp opened. Mark conversion only after the order is approved and the entitlement exists.

### D. Admin control center
Build a protected `/admin` area with:
- Overview: customers, active subscriptions, pending activations, pending orders, open leads, abandoned checkouts, subscriptions expiring within 7 days, product count.
- Customers: search, profile, products owned, orders, entitlements, devices, activity/security events.
- Orders: receipt preview via short-lived signed URL, plan/price snapshot, approve/reject, mandatory reason and verified payment reference.
- Leads: new/contacted/checkout_started/converted/lost; follow-up status.
- Subscriptions: grant/revoke, suspend/reactivate account, show expiry and product.
- Devices: device hash, first/last seen, IP events, revoke device. Do not use IP alone to accuse/block a user; IP can be shared or change.
- Security events: IP, event type, account, product, device hash, timestamp, risk score.
- Products/plans: create/update product copy, WhatsApp contact, prices, terms, device limits, active/draft/archive.
- Order messages: customer/admin thread.
- Audit trail: every admin action must be attributable to an authenticated admin and have a reason.

All admin routes must verify `app_metadata.role === "admin"` server-side. A hidden frontend button is not security.

### E. Brand and sales content
- Rename public branding to **MF Plugin**; avoid the personal-name suffix.
- Keep the current domain `mf.mahmoudmostafa.online` until the owner confirms a different domain and DNS ownership.
- Use product content from Supabase (plain text/structured JSON, never inject arbitrary HTML).
- Use the database WhatsApp support number for sales messages.
- Keep the sales page and admin dashboard as two views of the same platform, not separate backends.

## 6. Premiere plugin integration

- Locate the actual extension source and determine its supported Premiere Pro versions and CEP/UXP architecture.
- Update the plugin to authenticate with Supabase Auth and call `mf-license/validate` with `productSlug: "mf-plugin"` and a stable device hash.
- Verify the Ed25519 signed entitlement locally using only the public key. Never ship the private key or service-role key.
- Verify signature, `sub`, product slug/product ID, entitlement ID, device binding, issue time, expiry, and plan status. Reject wrong-product and wrong-device tokens.
- Handle offline behavior explicitly with a bounded grace period only if the owner approves it; never silently treat a failed validation as a permanent license.
- Ensure no user can change product slug, device limit, or expiry in the client to gain access.
- Test first activation, repeat activation on the same device, second-device denial, revocation, suspension, Monthly expiry, Lifetime no-expiry, network failure, and clock manipulation.
- Do not claim Premiere compatibility until tested in an actual Premiere installation.

## 7. Database and migration safety

- Inspect `supabase/migrations` and remote history. Remote Staging has 14 versions; the original five migrations are not currently represented in the repo.
- First recover/reconcile the missing baseline safely. Use `supabase --version`, `supabase --help`, and current Supabase CLI v3 documentation before running commands.
- Compare `supabase migration list --remote --project-ref bgyplclmucmkmajilhhs` with local files.
- Do not run `db reset`, `migration repair`, or `db push` blindly. Explain and review the exact plan and diff first.
- Use local Supabase for tests where feasible. Never point local tooling at Production.
- Review RLS, grants, SECURITY DEFINER search_path, RPC execution grants, FK indexes, constraints, and storage bucket privacy.
- Keep IP events server-written only. Add/verify rate limits on public endpoints and admin actions.
- Add a retention job for IP events only after the owner approves the privacy policy and retention duration.
- Enable leaked-password protection in Staging after verifying the relevant Auth settings. Do not alter Production.

## 8. Deployment and CI

- Inspect `.github/workflows/jekyll-gh-pages.yml`, root `index.html`, root `assets`, and `services/web/vite.config.ts`.
- Prepare a separate CI workflow that runs `npm ci` and `npm run build` in `services/web`, publishes Vite `dist`, and preserves the custom-domain CNAME.
- Test the artifact/preview without replacing the current live site.
- Add typecheck/build/lint/unit tests and Edge Function checks.
- Keep the existing production workflow untouched until the new workflow is validated and the owner approves switching.

## 9. Required tests and evidence

Run and report:
- `npm ci` and `npm run build` in `services/web`.
- TypeScript checks and any project test scripts.
- Deno checks for both Edge Functions.
- SQL tests for RLS, plan snapshots, Monthly/Lifetime approval, first activation, product-scoped device limits, device revocation, order messages, and maintenance.
- API tests for public catalog/lead/session, authenticated order/receipt/status/messages, admin overview/orders/review/grant/revoke/suspend/product editing.
- Browser E2E for visitor -> lead -> signup/login -> checkout -> receipt -> admin review -> license activation.
- Premiere Pro manual E2E on a supported version.
- Confirm no secrets in Git, client bundles, logs, or source maps.
- Re-run Supabase security/performance advisors and document every remaining warning.

If a test cannot run in your environment, say exactly why. Do not label it passed.

## 10. Completion criteria and final report

Do not call the project ready until:
- Website UI uses Supabase as the single source of truth.
- Admin login and owner role work securely.
- Sales catalog/content/WhatsApp number are database-driven.
- Leads, abandoned checkouts, orders, payments, entitlements, devices, IP events, messages, and audit history are visible and manageable.
- Plugin license validation is product-bound and tested in Premiere.
- Vite build and deployment artifact pass without changing Production.
- All tests and security checks are documented.

When finished, provide:
1. Files changed and commits.
2. Staging schema/functions status.
3. Build/test outputs and exact pass/fail evidence.
4. Remaining blockers and owner actions (SMTP, admin identity, privacy retention, Premiere runtime).
5. Safe step-by-step instructions to test the release candidate.
6. A separate Production release plan that is not executed.

**Keep PR #1 Draft and do not merge or deploy to Production.**
