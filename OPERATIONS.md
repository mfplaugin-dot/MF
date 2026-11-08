# MF Plugin operations

## Environment boundaries

- Staging only: `mfplugin-staging`, project ref `bgyplclmucmkmajilhhs`.
- Production ref `ymrvwzdqbaaodnozkgcm` is out of scope.
- Never publish the live website, change DNS, merge the Draft PR, or deploy the
  plugin to Production without explicit approval.
- Do not use Docker or WSL2 for this workflow.

## Local website

Copy `services/web/.env.example` to the ignored `services/web/.env.local`, add
the Staging publishable/anon key, then run `npm ci`, `npm run build`, and
`npm run dev` from `services/web`. Never use a service-role key in the browser.
The GitHub Actions Vite workflow uploads a build artifact only; it does not
deploy the site.

## Staging backend

The latest local `mf-platform` source has not been deployed: the Supabase CLI
state is inaccessible in this sandbox. A read-only live check confirmed the
catalog works and anonymous admin requests are rejected, but
`POST /functions/v1/mf-platform/order/list` returns 404. Treat this as a
deployment blocker; local frontend behavior cannot be considered integrated
with the current remote function.

Restore Supabase CLI access in a trusted local session, verify the project name
and exact reference, then deploy only the explicitly authorized Staging
function. Do not paste tokens or secrets into chat or logs.

The remote database already contains earlier Staging migrations whose source
files are missing from this repository. Reconcile migration history before any
future push. Do not reset the database, repair history blindly, or reapply the
five previously applied migrations.

`supabase/migrations/20261108200000_mf_admin_account_status_reason.sql` is
forward-only and remains unapplied. It changes the account-status RPC
signature; coordinate it with compatible `mf-platform` and `mf-license`
function versions rather than applying the migration alone.

## Required owner setup

1. Verify the owner's real Staging Auth identity before granting
   `app_metadata.role=admin`; never promote a test or guessed account.
2. Configure SMTP, sender/domain verification, and allowed HTTPS recovery
   redirects. Verify signup and password recovery before customer onboarding.
3. Enable and verify leaked-password protection in Staging Auth.
4. Approve privacy-notice text/version and IP/security-event retention. Order
   submission remains blocked until each product has an approved notice and
   version in catalog content. No automatic 90-day deletion is configured.
5. Test receipt upload, admin review, account/device controls, and licensing
   with synthetic Staging data only.
6. Install the isolated Staging extension and perform interactive tests in the
   supported Premiere Pro environment. The base license configuration remains
   disabled.

## Manual payment handling

The site does not process or automatically verify payments. Customers contact
the configured WhatsApp number and submit an order/receipt. An administrator
independently verifies the transfer and records the payment reference and
reason before approval. Do not treat an uploaded receipt or WhatsApp click as
payment confirmation.
