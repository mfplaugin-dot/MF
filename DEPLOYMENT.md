# Website build and deployment

The existing custom domain is `https://mf.mahmoudmostafa.online/`. The existing
Jekyll workflow deploys from the repository root on `main`; it remains
unchanged. Do not merge this draft PR or replace the live site as part of
Staging integration.

## Staging Vite artifact

`.github/workflows/vite-staging-artifact.yml` builds only the Vite app from
`services/web` and uploads a short-lived artifact. It has no deployment job and
does not publish to GitHub Pages. Configure the repository Actions variable
`MF_STAGING_PUBLISHABLE_KEY` with the Staging publishable/anon key to make
preview builds connect to Staging. The key is public client configuration; do
not use the service-role key. Local builds may use `services/web/.env.local`,
which is ignored by Git. `services/web/public/CNAME` preserves the existing
custom-domain file in a future artifact. Root-path hosting is configured for
that domain.

To build locally:

```powershell
cd services/web
npm ci
npm run build
```

Inspect `services/web/dist` as a preview artifact only. Switching the live Pages
workflow to this artifact requires a separate, explicitly approved release and
rollback plan.

## Legacy Azure rollback/reference

The Azure API project in `services/api` is retained as a rollback/reference
implementation; the Vite Staging frontend uses Supabase Auth and Edge
Functions. Do not provision, migrate, or deploy Azure as part of this Staging
release candidate. Do not remove the legacy implementation until backend
parity, integration tests, and an approved rollback plan exist.
