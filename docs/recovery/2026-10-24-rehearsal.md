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

The original development checkout remains clean at PR #18. Application formatting, lint/type checks, unit/E2E/browser/Edge suites and the new recovery safeguard tests passed; the real local integration and synthetic-cover smoke passed. The independent dependency repair is draft [PR #21](https://github.com/ryan-voitiskis/crate-guide/pull/21): its database CI passed, while the unchanged application audit gate remains blocked by the Zod and node-forge advisory roots. No audit exception was added.

Independent password-manager key custody and unattended operation remain unverified. There is no daily schedule, automatic retention deletion, staleness alert or monthly automated restore yet. Follow the [runbook](runbook.md) before activation. No private values, database contents or decryption identity belong in this evidence record.
