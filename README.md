# MF Plugin Central Platform

The canonical customer website is the Vite application in `services/web`. Its
Staging source of truth is Supabase project `mfplugin-staging`
(`bgyplclmucmkmajilhhs`), using the `mf-platform` and `mf-license` Edge
Functions. The public website domain remains
`https://mf.mahmoudmostafa.online/`.

## Local website development

1. Copy `services/web/.env.example` to `services/web/.env.local`.
2. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to the Staging publishable/anon key.
   The URL in the example is Staging. Never use a service-role key or private
   signing key in a `VITE_*` variable.
3. Run:

   ```powershell
   cd services/web
   npm ci
   npm run dev
   npm run build
   ```

The website fails closed when Supabase configuration or the live catalog is
unavailable; it must not create demo orders or imply that payment was received.
Checkout is manual: a human independently verifies the transfer before an
administrator approves an order.

## Supabase and release safety

- Edge Function source: `supabase/functions/`.
- New platform migrations: `supabase/migrations/`.
- The remote Staging database contains five earlier migrations whose source
  files are absent from this repository. Reconcile that baseline before any
  migration push. Do not reset the database or reapply migrations.
- The Vite artifact workflow builds and uploads a preview only. The existing
  root/Jekyll Pages deployment remains unchanged. Do not merge this Draft PR,
  switch the live workflow, change DNS, or publish the website without explicit
  approval.
- Production Supabase (`ymrvwzdqbaaodnozkgcm`) is outside the scope of this
  branch.

## Legacy Azure rollback/reference

`services/api`, `database/migrations`, and `_MF-Project` are retained legacy
materials. They are not the Vite website's Staging backend. Do not remove or
deploy them until Supabase integration tests pass and a rollback plan has been
reviewed and approved. `npm --prefix services/api test` runs the legacy API's
local unit tests; its database migration command is not part of this Staging
workflow.

## Owner-dependent release requirements

- Create and confirm the real owner account in Staging, then assign
  `app_metadata.role=admin` only to that verified identity.
- Configure and verify custom SMTP and HTTPS account recovery before enabling
  customer onboarding or licensing.
- Approve a privacy notice and retention period before scheduling deletion of
  IP/security-event data. The existing 90-day marker is not an automatic purge.
- Complete real browser and Premiere Pro tests before claiming release
  readiness.
