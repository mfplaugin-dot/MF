# Production deployment

The website is prepared for GitHub Pages at `https://mf.mahmoudmostafa.online/`.
The repository must be pushed to GitHub before its Pages workflow can run. This
workspace has no Git repository or remote configured, so it has not been
published.

## GitHub Pages frontend

1. Push this project to a GitHub repository, preserving `.github/workflows/deploy-pages.yml`.
2. In repository **Settings → Pages**, select **GitHub Actions** as the build and
   deployment source.
3. In **Settings → Secrets and variables → Actions → Variables**, add
   `API_ORIGIN` with the HTTPS origin of the production API, without a path. For
   example, use the API custom domain you have actually configured in Azure.
   Do not use the website origin or an unconfigured example hostname.
4. Configure DNS for `mf.mahmoudmostafa.online` to point to the GitHub Pages
   site, verify the custom domain in GitHub, and enable HTTPS. The checked-in
   `services/web/public/CNAME` is copied into the Pages artifact.
5. Push to `main` or run **Deploy website to GitHub Pages** manually. The
   workflow fails rather than publishing if `API_ORIGIN` is missing or is not
   HTTPS.

## API and browser security

GitHub Pages serves only the frontend; it does not run the Azure Functions API,
SQL database, or private receipt storage. Before enabling the storefront for
real orders:

1. Deploy `services/api` as an Azure Functions Node.js app and configure its
   supported Node runtime.
2. Provision Azure SQL and private Blob Storage, apply the reviewed migration
   in `database/migrations/`, and configure the API's database, storage, admin,
   encryption, session-signing, and entitlement-signing settings in Azure
   application settings/Key Vault. Use independently generated production
   secrets; never put them in the website bundle or GitHub Pages variables.
3. Bind and verify an HTTPS API custom domain under
   `mf.mahmoudmostafa.online` (for example, a dedicated `api` subdomain). This
   keeps the admin session cookie same-site while the UI and API remain
   cross-origin. Set `COOKIE_SECURE=true`.
4. Configure Azure Functions CORS to allow exactly
   `https://mf.mahmoudmostafa.online`, with credentials enabled. Never use a
   wildcard origin with credentialed requests. Verify preflight requests for
   `Authorization` and receipt uploads before release.
5. Add the verified API origin as the GitHub Actions `API_ORIGIN` variable and
   redeploy the frontend.
6. Before accepting money, complete the remaining backend production controls:
   trusted-proxy rate limiting, CSRF/origin protections, approved retention
   policy, recovery and subscription-renewal workflows, authorized payment
   setup, and a verified installer release. Until then, the app must not be
   presented as a functioning production checkout or license-delivery service.

Local development continues to use the Vite `/api` proxy to
`http://127.0.0.1:7071`. `VITE_API_ORIGIN` is a build-time public URL, not a
secret.
