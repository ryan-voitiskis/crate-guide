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

The initial object is explicitly a **database recovery point**: it was sealed before the production Auth settings export was unblocked. The Auth configuration, function metadata, platform encryption key and all five custom Edge values have since been captured privately; the custom Edge values match the live secret digests. Those files must be included in a subsequent verified recovery set before declaring the complete baseline ready.

Independent password-manager key custody and unattended operation remain unverified. There is no daily schedule, automatic retention deletion, staleness alert or monthly automated restore yet. Follow the [runbook](runbook.md) before activation. No private values, database contents or decryption identity belong in this evidence record.
