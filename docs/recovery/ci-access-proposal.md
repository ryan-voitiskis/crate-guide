# Dedicated recovery credential proposal

Status: the owner approved these exact grants and CI storage on 24 October 2026. All three credentials were created. The four CI values were installed in the `production-recovery` GitHub environment, whose deployment policy was read back as the main branch only. The local restore credential was not provisioned to GitHub. Live checks confirmed that the Supabase token can access production while staging and the account-wide project list return HTTP 403; the R2 restore credential can read its synthetic probe but both upload and deletion are denied.

All three credentials expire on 22 January 2027, approximately 90 days after creation. Keep local copies only in the private, ignored recovery folder with mode 600. The capture workflow receives no private age identity.

## Approved connection-pooler correction

A full scoped CLI export exposed an additional required read permission: `GET /v1/projects/czlfiwivlgqhqezmywfx/config/database/pooler` returns HTTP 403 with `database_pooling_config_read` missing. The CLI masks that denial as an IPv6 error. The prepared replacement, `crate-guide-recovery-ci-20261024-pooler`, has the same project boundary, expiry and existing grants, plus Connection Pooling Read (one endpoint). It cannot change pooler settings. Supabase does not permit editing issued token access. The owner approved the correction, replacement of the protected CI/local value, and revocation of the superseded token after verification. The replacement was created; pooler reads now return HTTP 200 while staging and account-wide listing remain denied. A full production capture, encrypted upload and read-only independent restore passed. The local and protected CI values were replaced; the superseded token was deleted and a live request returned HTTP 401.

## Supabase source credential

Name: `crate-guide-recovery-ci-20261024-pooler`. Resource access: production project `czlfiwivlgqhqezmywfx` only, in organization `grxffkeajwssrcfwtxny`. No account-wide or organization-wide grant.

- Read-write: Database (the CLI creates temporary login roles); Project Settings (the encrypted export includes the original pgsodium encryption root).
- Read: API Keys, API Key Secrets, Auth Config, Data API Config, Database Config, Connection Pooling, Network Restrictions, SSL Enforcement, Edge Functions, Edge Function Secrets, Realtime Config and Storage Config. Several configuration reads are jointly required by the CLI's project configuration endpoint.
- Every other capability: None.

These permissions are powerful: the token can change production data and settings, pause or delete the project, and read production keys and configuration. The capture itself runs read-only exports and verifies the exact project and organization. The token is not a strictly read-only credential. Its destination is the `RECOVERY_SUPABASE_ACCESS_TOKEN` encrypted secret in this repository's `production-recovery` GitHub environment, restricted to the main branch. Custom Edge values also go into that environment's encrypted `RECOVERY_EDGE_SECRETS_JSON` secret so the runner can capture the deployed configuration. Neither is printed in logs or uploaded as a CI artifact.

## R2 upload and retention credential

Name: `crate-guide-backup-ci-20261024`. Account token restricted to Object Read & Write on the EU bucket `crate-guide-production-backups` in Cloudflare account `2584e96da1501a94e4af53e21f8f018d`. It can read, list, upload and delete objects in that bucket. It cannot administer buckets or access other buckets. Its two S3 values go into the same protected GitHub environment as `RECOVERY_R2_ACCESS_KEY_ID` and `RECOVERY_R2_SECRET_ACCESS_KEY`.

## Independent monthly restore credential

Name: `crate-guide-restore-readonly-20261024`. Account token restricted to Object Read only on the same EU bucket. It can list and download encrypted objects, but cannot change them. It stays in the private local recovery folder and is not provisioned to GitHub. The monthly rehearsal uses this credential and the separately held age identity to restore into an isolated local container.

Expired or revoked credentials must fail the daily capture and staleness checks. Rotation should be completed before 22 January 2027.
