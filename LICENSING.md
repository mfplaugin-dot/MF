# MF Plugin licensing

## Entitlement rules

- Monthly access lasts 30 days from the first eligible device activation.
- Renewals queue behind the current term; they do not shorten it by starting
  concurrently.
- Lifetime access has no expiry.
- A new license permits one active device unless its product plan specifies
  another limit. Device rules are enforced server-side.
- New grants and payment approvals are manual. An administrator must verify
  the transfer and provide a review reason; Monthly grants also require the
  verified payment reference.
- Signed Ed25519 entitlements are verified with the public key in the client.
  The private signing key and Supabase service-role key remain server-side.
- The plugin permits at most seven days of offline grace after a successful
  online validation. An explicit server denial, invalid signature, wrong
  product/device, expired term, or revocation must not be bypassed by cache.
- Licensing fails closed when configuration or verification is missing.

## Build configuration

- The base `data/license-config.json` remains disabled and unconfigured.
- Staging configuration is isolated from the base installation and uses only
  the Staging Supabase URL and matching public key.
- The installed Staging package has email-provider attestation disabled.
  Staging login/activation therefore remains fail-closed until Auth email
  delivery and the signing-key configuration are verified.
- Never include a private key, service-role key, or live user token in a plugin
  package.

## Release status

The local installed-plugin test suite passed 80 tests. These tests do not prove
interactive activation or compatibility in Premiere Pro. A real Staging
account, deployed current Edge Function, configured mail flow, and Premiere
runtime test are still required before release claims.
