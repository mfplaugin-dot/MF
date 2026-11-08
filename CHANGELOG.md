# Changelog

## Unreleased — Staging integration

- Connected the Vite website to Supabase Auth and the `mf-platform` API for
  catalog, checkout, customer orders, and admin operations.
- Added admin modules for products/plans, leads, accounts and entitlements,
  security events, and customer support messages.
- Added email password-recovery UI and made order submission require a
  product-configured privacy notice and version.
- Added a Vite build-only GitHub Actions artifact workflow. The existing live
  Jekyll workflow is unchanged.
- Bound the installed plugin's license checks to the `mf-plugin` product and
  signed device entitlement.
- Required an administrator reason for account suspension/reactivation and
  added a forward-only migration for its audit record. The migration is not
  applied to Staging.
- Prevented admins from manually marking checkout leads as converted;
  conversion is reserved for verified order approval.
- Kept the Azure API implementation for rollback/reference. No Production
  website, Supabase project, or plugin license configuration was changed.

## Verification

- Website `npm ci` and `npm run build`: passed.
- Legacy API tests: 5 passed.
- Installed plugin tests: 80 passed.
- Deno checks for both repository functions and the Staging-copy license
  function: passed.
- Live Staging catalog: HTTP 200 with the approved plan values; anonymous
  admin, license, and order-table access were denied.
- Live Staging `order/list`: HTTP 404 because the latest function source is not
  deployed. Receipt Storage authorization was inconclusive.
- Local production preview: server started, but browser and HTTP requests could
  not connect to the sandbox-local port.
- Supabase function deployment: not completed; local CLI state is inaccessible
  in this sandbox.
- No migration or Production change was performed.
