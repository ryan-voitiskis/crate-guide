# Independent encrypted recovery

The backup destination is the private `crate-guide-production-backups` R2 bucket in Cloudflare account `2584e96da1501a94e4af53e21f8f018d`, with EU jurisdiction. Its `r2.dev` endpoint is disabled and it has no custom domain. The public encryption recipient and exact Supabase source are in `deployment/recovery.json`. The private age identity must stay outside the repository and outside R2, with a recoverable copy in the owner's password manager.

Unattended recovery is **not activated**. Capture, encryption, remote readback and isolated restoration have been exercised manually, including the bucket-scoped S3 transport; the evidence record is [24 October](2026-10-24-rehearsal.md). Live retention kept both complete sets and deleted none. A manual-only GitHub Actions workflow is prepared. Protected CI credentials, failure/staleness notification and the monthly rehearsal schedule still need activation and verification. No daily schedule is enabled.

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

`.github/workflows/recovery.yml` is deliberately `workflow_dispatch` only and runs only reviewed `main`. It provides no decryption identity to CI, does not upload CI artifacts and removes runner plaintext even on failure. It separates source credentials from the storage/retention steps. Before its first execution, configure `RECOVERY_SUPABASE_ACCESS_TOKEN`, `RECOVERY_EDGE_SECRETS_JSON`, `RECOVERY_R2_ACCESS_KEY_ID` and `RECOVERY_R2_SECRET_ACCESS_KEY` as protected Actions secrets. Confirm the Supabase token's exact required privileges: CLI-managed database authentication creates a temporary login role, so that flow needs Database read-write permission even though the exported SQL queries are read-only. Do not describe it as a strictly read-only credential.

For unattended upload, use `RECOVERY_R2_TRANSPORT=s3` with the R2 access-key variables above. The AWS CLI is installed by the workflow and must be installed for a local S3 rehearsal. Its endpoint and bucket are fixed to this account's EU destination, and credentials stay in the environment. Use an R2 token restricted to **Object Read & Write** on this single bucket; those permissions support the S3 API, rather than Wrangler's Cloudflare REST API. See [Cloudflare's token documentation](https://developers.cloudflare.com/r2/api/tokens/).

After ciphertext upload and successful readback, a complete set receives a non-secret success receipt under `recovery-v1/success/`. Partial database-only sets do not advance retention. `npm run recovery:retain` reads those receipts through S3, validates their project/path/hash metadata, checks that every retained object exists at the recorded size, then removes only success-marked sets beyond the newest 30. A failed or malformed receipt or missing retained object aborts deletion. Live S3 capture/readback/restore and retention with two complete sets passed on 24 October. No production backup was deleted; the deletion boundary beyond 30 sets is covered by deterministic safeguard tests. The local test credential expires on 23 November 2026 and is not provisioned to CI.

Use an unattended runner whose availability supports the daily recovery objective, with credentials limited to the production source and this bucket. Keep the decryption identity out of the capture runner. Retain the most recent 30 **verified successful** sets; failed captures or uploads must never advance retention or delete the last good set. Verify failure delivery and alert when the last success is stale. Run an isolated restore from a downloaded encrypted set at least monthly using the separately held identity. Record the data-capture window and elapsed restore time rather than claiming an unmeasured recovery objective.

Do not mark recovery activated until all of those checks, independent key custody and the first complete uploaded/restored set are recorded. See [Supabase's logical backup guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for managed-schema and encryption-key considerations.
