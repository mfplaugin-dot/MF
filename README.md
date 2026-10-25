# MF Sales & Licensing

Standalone Arabic/English sales site and Azure Functions API for MF Premiere Pro. This project is separate from `MF-Portal`.

## Local development

- Frontend: `npm --prefix services/web install`, `npm --prefix services/web run dev`
- API: `npm --prefix services/api install`, `npm --prefix services/api run build`, `npm --prefix services/api test`, `npm --prefix services/api start`
- Database: configure `SQL_CONNECTION_STRING`, then run `npm --prefix services/api run migrate` to apply the versioned schema-only migrations in `database/migrations/`. The runner also reads `services/api/local.settings.json` for local development. No seed data is created.
- If the API is unavailable on localhost, the storefront offers a clearly labeled checkout demo. Demo orders and receipt selections stay in the current browser session; no payment details are shown, no receipt is uploaded, and no real order is created. This fallback is never enabled on a non-local host.
- Set untracked local API settings from `services/api/local.settings.example.json`. Admin auth requires an `ADMIN_USERNAME`, scrypt `ADMIN_PASSWORD_HASH`, and high-entropy `SESSION_SIGNING_SECRET`. No default credentials are provided.

## Production deployment preparation

The frontend includes a GitHub Pages workflow and the custom-domain file for
`mf.mahmoudmostafa.online`. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the
required GitHub Actions API origin variable, DNS setup, and Azure Functions
CORS/database/storage configuration. No repository remote or production Azure
resources are configured in this workspace, so this preparation does not mean
the site has been published or is ready to accept real orders.

For local admin setup, generate your own password hash out-of-band with Node's `crypto.scryptSync` (format `scrypt$<random-salt-hex>$<64-byte-hash-hex>`); never use a sample password or commit the hash. `SESSION_SIGNING_SECRET` must be 32+ random bytes; `CREDENTIAL_ENCRYPTION_KEY` must be 32 random bytes in hex; `ENTITLEMENT_PRIVATE_KEY` must be an Ed25519 PKCS#8 private PEM. Keep all values in untracked local settings / managed secret storage.

The API fails closed when SQL, private blob storage, or required secrets are not configured. Use Azurite or suitable local Azure Functions storage settings for `AzureWebJobsStorage`. Receipts use a private container and are never returned as public URLs. Human admin review is the only route to fulfillment. WhatsApp integration is disabled. IP-based rate limiting expects a trusted proxy to set `x-forwarded-for`; do not expose an untrusted raw Functions endpoint as production.

## Production blockers

Choose Azure region and budget; configure managed identity/Key Vault and SQL/blob authorization; apply a reviewed, versioned migration; define approved receipt/personal-data retention; set and verify a real installer release before enabling lifetime downloads; provision admin auth out-of-band; complete rate-limit proxy, CSRF/origin, account recovery, and subscription-renewal workflows; and verify authorized WhatsApp Business API access before enabling any adapter. No resources are provisioned here.
