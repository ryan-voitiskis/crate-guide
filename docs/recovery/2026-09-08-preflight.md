# Recovery preflight — 8 September 2026

Recovery is **not activated**. This is access and tooling evidence, not a complete backup or restore record.

## Verified access

Ryan reauthenticated the Supabase CLI and authorized enabling the required Cloudflare services. CLI project discovery now returns both exact targets in organization `grxffkeajwssrcfwtxny`, with status `ACTIVE_HEALTHY`:

- Production: `czlfiwivlgqhqezmywfx` (`crate-guide`).
- Staging: `xrekloexiottvfueijgb` (`crate-guide-staging`).

Both checks for [PR #18](https://github.com/ryan-voitiskis/crate-guide/pull/18) passed at head `78b0456d9c1d88dae899afcaf9406bf46bbeb48e`. Recovery work uses a separate worktree and does not change that PR's source.

A read-only production query returned PostgreSQL `17.6`, 34 recorded migrations, an approximately 83 MB database, zero managed cover references, and zero objects in `record-covers`. These are point-in-time aggregate counts. The first complete backup must derive its cover inventory from the database snapshot and exercise a synthetic cover during the isolated rehearsal; an empty production bucket does not prove cover recovery.

## PostgreSQL tooling correction

The tracked `db.major_version = 15` made a real CLI schema export fail with:

```text
pg_dump: error: aborting because of server version mismatch
pg_dump: detail: server version: 17.6; pg_dump version: 15.8
```

The live production metadata identifies image version `17.6.1.141`, and the existing local database already runs `public.ecr.aws/supabase/postgres:17.6.1.155`. Set the configuration to major version 17 so CLI exports use a compatible tool. No hosted database upgrade, password reset, migration, or local database reset is part of this correction.

With major version 17, the CLI selected `public.ecr.aws/supabase/postgres:17.6.1.165` (image digest `sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518`) and the real production schema export completed with exit code 0. The 115,111-byte output contained the expected profiles, records, tracks, crates, and sets tables plus the deployed monotonic track-version trigger. Its SHA-256 was `516a34320f524efdcf9b20465a54da2ea2d1f9b1f70c0526a439abb334e95990`. This probe contains schema only, not Auth data, cover bytes, or a complete recovery set.

The CLI's dry-run connection script is not connection proof. A direct attempt to reuse its generated secret was rejected; the real CLI export initializes its login role and reached the database, where the old tool version caused the failure above. Use the CLI-managed authentication flow rather than treating a dry-run script as a reusable credential source. Any temporary connection scripts and schema probes are private working files and must be removed after verification.

## R2 activation checkpoint

Target Cloudflare account: `2584e96da1501a94e4af53e21f8f018d`. The authorized “Add R2 subscription” action advanced to payment setup, which requires billing details or saved-payment verification. The Chrome checkout is left open for Ryan. R2 is not yet activated and no bucket or backup schedule has been created.

The checkout shows $0 due now and the Standard free allowance: 10 GB-months, one million Class A operations, and ten million Class B operations. Usage above those allowances is billed at the displayed rates. Verify the current [R2 pricing](https://developers.cloudflare.com/r2/pricing/) before changing storage class or retention assumptions.

After billing activation, create a dedicated private backup bucket with public access disabled, establish scoped unattended access and recoverable encryption-key custody, and capture the database plus cover bytes. Retain 30 successful daily copies, verify uploaded ciphertext by reading it back, and prove an isolated restore before scheduling capture. A failed capture must not delete the last successful recovery set. Follow [current recovery requirements](../operations.md#recovery-activation); capture tooling, independent storage, key custody, and restore verification remain open.

The standard `age` encryption CLI (`1.3.2`) is installed locally for this work. No production encryption key or backup encryption identity has been created or changed.

## Verification

After a clean `npm ci`, `npm run format`, `npm run check:conventions`, and `npm run verify:full` passed in the isolated worktree. This included 2,526 application tests, 26 end-to-end tests (one existing skip), 82 browser tests, 146 Edge tests, 473 database assertions, and five real local Supabase integration tests, plus build, schema parity, security headers, and bundle budgets. The build used the same non-production URL/key values as CI.

Fixture teardown passed, a final read-only check found zero disposable integration Auth accounts, and the private schema/connection probe files were removed. The original checkout, its PR #18 head, and the running local Supabase database were preserved. No production application release was performed.
