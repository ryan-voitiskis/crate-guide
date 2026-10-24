# Recovery rehearsal — 24 October 2026

The Supabase CLI now reaches both Crate Guide projects in the intended organization. Cloudflare R2 billing was activated by Ryan, and the dedicated EU bucket was created with public access disabled. These checks supersede the access/billing blockers in the September preflight.

The first encrypted database recovery point was uploaded to:

```text
crate-guide-production-backups/recovery-v1/2026-10-24T03-14-53-932Z-285ac872-8130-472f-ad43-a321234b0e8e.tar.gz.age
```

The downloaded ciphertext was 272,778 bytes with SHA-256 `964eeddadf7bd1e9ae531c1e72b36a92057524597fc4e65254df45dabf5fa769`, matching the uploaded file. Decryption and restoration from that downloaded object passed in 2.985 seconds on the local Docker host. That measurement is a database rehearsal duration, not a production application recovery-time commitment.

| Restored data          | Count |
| ---------------------- | ----: |
| Auth users             |     2 |
| Records                |   180 |
| Tracks                 |   759 |
| Crates                 |     0 |
| Sets                   |     1 |
| Application migrations |    34 |
| Managed covers         |     0 |

All four Vault secret values were re-encrypted under the isolated target's key and their plaintext hashes matched. Auth and Storage migration ledgers were restored from the platform inventory. The before/after production schema exports were identical. The restore container had no network access, no published ports and cron launching disabled; its data volume was removed after the rehearsal. No application release or production business-data mutation was performed.

The empty production cover inventory was supplemented by a real local Storage fixture: download, metadata/fingerprint check, age encryption, decryption and file checksum comparison passed. The fixture's account, record, object and cleanup jobs were removed and checked. Local Supabase was not reset. A stopped Auth container with stale Docker runtime state was recreated from its original configuration; its previous stopped container was retained.

The initial object is explicitly a **database recovery point**: it was sealed before the production Auth settings export was unblocked. A subsequent fresh capture includes the Auth configuration, function metadata, original platform encryption key and all five custom Edge values verified against their live digests:

```text
crate-guide-production-backups/recovery-v1/2026-10-24T03-31-47-202Z-94141cd9-5b88-418c-8928-d3fc5340bf99.tar.gz.age
```

That complete data/configuration set is 277,626 encrypted bytes with SHA-256 `c88dea51cb73c6f9b8841d6bbc2c7da7852372ab49adbe261ab73fc2cba0ce9c`. Remote readback, decryption and another fresh isolated restore passed in 2.997 seconds with the same row counts. Capture ran from committed recovery tooling at `5533f96aa6b74533718baf486bd8e9b950fdbf5a`; its conservative data-export window was 03:29:16–03:30:12 UTC. The separately captured platform configuration, schema, Vault values and migrations were stable across the export. This window bounds snapshot acquisition; it is not a claim that every service was captured at one instant.

The original development checkout remains clean at PR #18. Application formatting, lint/type checks, unit/E2E/browser/Edge suites and recovery safeguard tests passed; real local integration and synthetic-cover smoke passed. The dependency repair in [PR #21](https://github.com/ryan-voitiskis/crate-guide/pull/21) has since passed both CI jobs and merged. Zod is patched. The owner approved a narrowly pinned node-forge build/development exception through 23 November; production bundle guards exclude that package and listhen. The privileged recovery runner uses a separate nine-package toolchain with no audit findings and no application dependencies.

Independent key custody was completed in the owner's Proton Pass Personal vault. The saved secure note was reloaded and its private identity matched the original local identity; the temporary import file was removed. The local identity remains outside the repository for restore rehearsals.

With the owner's approval, a 30-day account token was created with Object Read & Write restricted to this EU bucket. It expires on 23 November 2026 and is stored privately outside Git. An encrypted synthetic S3 object passed upload, download/hash, decryption and deletion checks. A final bucket inventory confirmed that no synthetic object remained.

A fresh complete production capture then exercised the committed capture/seal/restore commands through that scoped S3 credential:

```text
crate-guide-production-backups/recovery-v1/2026-10-24T04-50-35-290Z-6231eadb-cedd-46c0-92e2-5063558437be.tar.gz.age
```

The ciphertext is 277,636 bytes with SHA-256 `74f1a18b8354f07eba06da0a8e844f0db8a8e7d0d510755cd1a227ba2f607d30`. Capture used Node 24.18.1 at revision `8dbec4ca39a4b1a798604e4ae19b4dd7d90253ad`; its data-export window was 04:48:14.709–04:49:08.518 UTC. Remote readback, decryption and isolated restore passed in 3.105 seconds with the same counts as above. The success marker was read back and matched the upload receipt. Live retention verified both complete sets, kept both and removed none; deletion beyond the newest 30 remains covered by safeguard tests rather than a production pruning exercise. The bucket holds three encrypted recovery objects (including the initial partial set) and two complete success markers. Plaintext capture/restore files and the isolated target were removed after verification.

A further capture from committed isolated recovery tooling at `54aa9cd16b28c5dd470c6bee77e230282cec609c` produced:

```text
crate-guide-production-backups/recovery-v1/2026-10-24T06-37-44-961Z-3c0a7b8c-860c-4601-84ed-6f9b8e22e3db.tar.gz.age
```

Its 277,637 encrypted bytes have SHA-256 `bdb2c28a3181a861ab4bd98d5e1f523a93bbe551ab0000bb8a10af065f5e5ecf`; data capture ran 06:35:03.210–06:36:03.413 UTC. Remote readback and isolated restore passed in 6.286 seconds with unchanged counts, and plaintext was removed. A second restore using the newly created read-only R2 credential also passed. A synthetic encrypted-object probe proved the CI credential can upload and remove its own object, while the restore credential can read it but cannot write or delete it. That probe was removed.

The owner approved three dedicated credentials expiring 22 January 2027. Supabase production/config reads passed; staging and account-wide project enumeration were denied. The CI values are installed in `production-recovery`, whose sole deployment branch policy is the exact `main` branch. The decryption identity and read-only restore credential remain local and outside CI. `RECOVERY_DAILY_ENABLED=false` was read back before activation.

At that checkpoint unattended operation was still gated. The activation proof below supersedes that state. No private values, database contents or decryption identity belong in this evidence record.

## Unattended activation and independent verification

The replacement production-only Supabase credential includes the owner-approved Connection Pooling Read grant needed by the CLI to discover IPv4 connection details. A full export and CI capture passed. Staging and account-wide project enumeration remained denied; the superseded token was revoked and returned HTTP 401. The four CI values remain in the exact-main-only `production-recovery` environment. The private age identity and separate R2 reader remain outside CI. All three dedicated recovery credentials expire on 22 January 2027.

The first GitHub-hosted attempt exposed an Ubuntu 24.04 image dependency assumption: the runner already supplies AWS CLI, while its APT repository has no `awscli` package. [PR #25](https://github.com/ryan-voitiskis/crate-guide/pull/25) checks the supplied tool and installs age separately. A subsequent managed-cover capture exposed use of a disabled legacy API key; [PR #26](https://github.com/ryan-voitiskis/crate-guide/pull/26) reveals and prefers the current secret key, retains compatible legacy fallback and fails closed when the selected key is unavailable.

[CI capture 40076008786](https://github.com/ryan-voitiskis/crate-guide/actions/runs/40076008786), from source `4a44f207d6a4a5788794e448ae193be499a45b8e`, completed successfully. It encrypted and remotely verified:

```text
crate-guide-production-backups/recovery-v1/2026-10-24T07-58-12-941Z-c214b2c2-083b-4108-ab57-5947532d7958.tar.gz.age
```

The ciphertext SHA-256 is `df37a0d90d2da9656948285180c95f4bcbe26e4dd026ea95601e1aa30cab2a17`. Database capture ended at 07:57:27.514 UTC; upload/readback completed at 07:58:16.650 UTC. A separate local rehearsal downloaded the actual CI object using the read-only R2 credential and the independently held identity. Ciphertext size/hash, decryption, database/Vault/configuration checks, all 35 application migrations and the one managed smoke cover's bytes passed. The isolated SQL restore took 3.298 seconds; this is not a public application recovery-time guarantee. Its non-secret receipt remains in the private local recovery folder; downloaded ciphertext, restored plaintext, container and volume were removed.

A real capture failure opened [alert #24](https://github.com/ryan-voitiskis/crate-guide/issues/24), assigned to the owner. The GitHub notification was read back with reason `assign`; email inbox delivery was not claimed. A deliberately failed pre-capture run and the later cover failure reused that same issue without extra comments. Successful capture closed it at 07:58:51 UTC. [Watchdog 40076375631](https://github.com/ryan-voitiskis/crate-guide/actions/runs/40076375631) subsequently passed without reopening it. Tests also prove a fresh older set cannot clear a newer capture failure.

`RECOVERY_DAILY_ENABLED=true`, both recovery workflows' active state and the sole exact-main environment branch policy were read back after activation. Capture runs at 01:17 UTC daily; the separate watchdog checks every six hours. Retention validates complete success receipts and retained object sizes before selecting anything beyond the newest 30 successful sets. No production pruning was needed during activation; the beyond-30 deletion boundary remains covered by safeguards.

Two active local Codex heartbeats are attached to the originating chat: `crate-guide-recovery-health`, daily at 14:15 Melbourne time, and `crate-guide-monthly-restore`, on the 20th at 14:30. They use the dedicated clean operations checkout, Node 24.18.1 and the private read-only R2 credential; the age identity is used only for restoration. Healthy unchanged checks stay quiet, while meaningful failures, recovery, disabled/stale automation and expiry within 14 days are reported. Monthly completion records its receipt. These checks require this Mac and Codex to be running and supplement the GitHub capture/watchdog's shared scheduler dependency.

## Post-release clean recovery point

After both hosted fixture accounts passed all 28 cleanup scopes and normal browser sign-in rejected their deleted credentials, [capture run 40089218248](https://github.com/ryan-voitiskis/crate-guide/actions/runs/40089218248) passed on application source `1ed0d0e8ddfff8a4ad08197325f19230f33dd9ee`. Its database capture ended at `2026-10-24T11:17:57.994Z` and produced:

```text
crate-guide-production-backups/recovery-v1/2026-10-24T11-18-29-836Z-0b830121-d8d3-4112-abd6-5846e13d506a.tar.gz.age
```

Ciphertext SHA-256: `ef14dac586ab35146eeef085e5bdd29ea298037520c53509225b897077e6e621`. A separate local download using the read-only restore credential matched the success receipt, decrypted successfully and restored into isolated PostgreSQL 17 in **3.219 seconds**, with 35 application migrations and the captured database/cover inventories matching. The earlier non-empty managed-cover rehearsal above also remains valid. Network access was disabled, no host port was published and cron stayed disabled. The disposable target, volume, downloaded ciphertext and decrypted files were removed; only the private rehearsal receipt remains. The existing developer Supabase stack was preserved.
