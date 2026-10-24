# Dedicated recovery credential proposal

Status: prepared for owner approval on 24 October 2026. No new credential in this proposal has been created or installed in CI.

All three credentials expire on 22 January 2027, approximately 90 days after creation. Keep local copies only in the private, ignored recovery folder with mode 600. The capture workflow receives no private age identity.

## Supabase source credential

Name: `crate-guide-recovery-ci-20261024`. Resource access: production project `czlfiwivlgqhqezmywfx` only, in organization `grxffkeajwssrcfwtxny`. No account-wide or organization-wide grant.

- Read-write: Database (the CLI creates temporary login roles); Project Settings (the encrypted export includes the original pgsodium encryption root).
- Read: API Keys, API Key Secrets, Auth Config, Data API Config, Database Config, Network Restrictions, SSL Enforcement, Edge Functions, Edge Function Secrets, Realtime Config and Storage Config. Several configuration reads are jointly required by the CLI's project configuration endpoint.
- Every other capability: None.

These permissions are powerful: the token can change production data and settings, pause or delete the project, and read production keys and configuration. The capture itself runs read-only exports and verifies the exact project and organization. The token is not a strictly read-only credential. Its destination is the `RECOVERY_SUPABASE_ACCESS_TOKEN` encrypted secret in this repository's `production-recovery` GitHub environment, restricted to the main branch. Custom Edge values also go into that environment's encrypted `RECOVERY_EDGE_SECRETS_JSON` secret so the runner can capture the deployed configuration. Neither is printed in logs or uploaded as a CI artifact.

## R2 upload and retention credential

Name: `crate-guide-backup-ci-20261024`. Account token restricted to Object Read & Write on the EU bucket `crate-guide-production-backups` in Cloudflare account `2584e96da1501a94e4af53e21f8f018d`. It can read, list, upload and delete objects in that bucket. It cannot administer buckets or access other buckets. Its two S3 values go into the same protected GitHub environment as `RECOVERY_R2_ACCESS_KEY_ID` and `RECOVERY_R2_SECRET_ACCESS_KEY`.

## Independent monthly restore credential

Name: `crate-guide-restore-readonly-20261024`. Account token restricted to Object Read only on the same EU bucket. It can list and download encrypted objects, but cannot change them. It stays in the private local recovery folder and is not provisioned to GitHub. The monthly rehearsal uses this credential and the separately held age identity to restore into an isolated local container.

Expired or revoked credentials must fail the daily capture and staleness checks. Rotation should be completed before 22 January 2027.
