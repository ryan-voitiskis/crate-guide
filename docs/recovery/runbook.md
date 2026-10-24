# Independent encrypted recovery

The backup destination is the private `crate-guide-production-backups` R2 bucket in Cloudflare account `2584e96da1501a94e4af53e21f8f018d`, with EU jurisdiction. Its `r2.dev` endpoint is disabled and it has no custom domain. The public encryption recipient and exact Supabase source are in `deployment/recovery.json`. The private age identity must stay outside the repository and outside R2, with a recoverable copy in the owner's password manager.

Unattended recovery is **not activated**. Capture, encryption, remote readback and isolated restoration have been exercised manually; the first evidence record is [24 October](2026-10-24-rehearsal.md). The daily operator credentials, 30-successful-copy retention, failure/staleness notification and monthly rehearsal schedule still need activation and verification. No scheduled capture is supplied by these manual commands.

## Capture and encrypt

Use a clean committed checkout with its own `npm ci`, Node 24.18.1, Docker, age and authenticated Supabase/Wrangler CLIs. The configured database major version must remain 17. Provide an authorized Supabase Management token through `SUPABASE_ACCESS_TOKEN` and a protected JSON file containing the custom production Edge secret values through `RECOVERY_EDGE_SECRETS_FILE`. The capture validates those values against the production digests; it fails if a value is missing or stale. Never put tokens or secret values on a command line, in tracked files or in CI logs.

```sh
npm run recovery:capture -- /absolute/private/new-capture-directory
npm run recovery:seal -- /absolute/private/new-capture-directory
```

The capture fixes the production project and organization, requires PostgreSQL 17, and does not run migrations. It records roles, schema, application/Auth/Storage data and migration history. One `pg_dump --data-only` invocation captures those rows together. Separate before/after exports must show identical schema, Vault, migration and platform configuration; a change fails the run. This is a logical data snapshot plus separately checked platform settings, not an atomic snapshot of the entire service.

The set includes the Auth configuration, deployed function metadata, custom Edge values verified against their digests, the original platform encryption root key, and a plaintext Vault export protected by the outer age encryption. That Vault export allows recovery under a fresh target's key. The pinned restore implementation supports Vault 0.3.1. Provider-managed signing/API keys should be reissued for a replacement project; source URLs, OAuth callbacks and scheduled integrations require deliberate rebinding before enabling traffic.

Capture first restores the SQL into a fresh disposable container and derives its row counts, migration inventory and managed-cover inventory from that snapshot. A missing referenced Storage object, invalid ownership relationship, missing cover fingerprint, changed cover ETag or size fails the run. Every captured cover receives a SHA-256 checksum. `seal` encrypts locally, uploads the ciphertext under a unique R2 object name, downloads it and compares its SHA-256 before writing `upload-receipt.json`. It does not delete older backups.

The working capture directory contains production data in plaintext. Keep it mode 700, remove its plaintext contents after successful encrypted restoration, and retain only the encrypted archive and non-secret receipts as needed. Never treat a partial directory or an unverified upload as a successful recovery set.

## Isolated restoration

Download the selected encrypted object from the exact EU bucket. Compare its ciphertext hash with the trusted upload receipt, then use the independently held identity:

```sh
npm run recovery:restore -- \
  /absolute/private/new-restore-directory \
  /absolute/private/readback.tar.gz.age \
  /absolute/private/production.agekey
```

The command rejects archive links and unexpected paths, checks all recorded file hashes and restores into a disposable container pinned to the production PostgreSQL image digest. Before any SQL or cleanup, it verifies the container's unique run label, `network=none` and absence of published ports. Cron launching is disabled. No Auth, mail or provider service is started, and no scheduled source jobs are restored. Managed Auth/Storage migration ledgers and all Vault values are restored; Vault plaintext hashes, application ownership relationships, migration inventory, row counts and cover bytes are checked. The target container and its volumes are removed after the rehearsal, and `restore-receipt.json` records duration and counts.

This proves database and file recovery in isolation. It does not prove a replacement public application has been deployed, an OAuth provider accepts new callbacks, or a customer has completed a real sign-in. Those are separate controlled acceptance steps after configuration review.

## Synthetic cover check

```sh
npm run smoke:recovery-cover
```

This uses only the guarded Crate Guide local stack at ports 42821/42822. It creates one disposable account and cover, downloads the real Storage bytes with the capture helper, verifies their snapshot metadata, encrypts and restores the file, then removes and verifies only its own fixtures and cleanup jobs. Production currently has no managed covers, so this check supplements the empty production inventory.

## Activation requirements

Use an unattended runner whose availability supports the daily recovery objective, with credentials limited to the production source and this bucket. Keep the decryption identity out of the capture runner. Retain the most recent 30 **verified successful** sets; failed captures or uploads must never advance retention or delete the last good set. Verify failure delivery and alert when the last success is stale. Run an isolated restore from a downloaded encrypted set at least monthly using the separately held identity. Record the data-capture window and elapsed restore time rather than claiming an unmeasured recovery objective.

Do not mark recovery activated until all of those checks, independent key custody and the first complete uploaded/restored set are recorded. See [Supabase's logical backup guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for managed-schema and encryption-key considerations.
