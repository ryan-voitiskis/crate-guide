# Library repository architecture

Crate Guide treats storage location, account identity, and connectivity as
independent state. A workbench can therefore target a Cloud library, a future
library in this browser, or Demo data without pretending that a local library
belongs to a Supabase user.

This document is the contract for the domain boundary introduced before local
browser persistence. Cloud and Demo are product-facing adapters. The full
browser-library adapter exists internally, while its accountless product
flows remain deferred. Device-local enrichment drafts are already active.

## Active device drafts

Application consumers use `app/repositories/deviceDrafts/contracts.ts` for the
draft API and lazily open `app/repositories/deviceDrafts/index.ts`. Draft reads
live in `browserDraftReads.ts`; they no longer import the deferred workspace
export, copy-receipt, and storage-health operations. A dependency-graph test
prevents that coupling from returning. Existing workspace-adapter exports
remain compatible.

This extraction preserves the database name, schema version, object stores,
keys, codecs, lease behavior, revision checks, and upgrade path. The full
browser repository and catalog must not become runtime dependencies of the
active draft entry point. The shared codec, schema, and revision kernel still
needs incremental work; it cannot be deleted with the deferred product adapter.

## Ownership

| Owner                            | Data                                                                                             | Lifecycle rule                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Account identity and integration | profile name, authenticated subject, Discogs account state                                       | follows the verified account and is never exported as library data                 |
| Active library                   | records, tracks, crates, saved sets, covers, theme, key format, layout and turntable preferences | follows the selected workspace and is read and written only through its repository |
| Device presentation              | density and the signed-out/no-workspace theme fallback                                           | remains on the device and cannot overwrite a hydrated workspace                    |

Cloud preferences currently map to columns on the Supabase profile row, but
that is a transport detail of `cloudPreferencesRepository`. Presentation code
must read `libraryPreferencesStore`; `userStore` owns only identity and
integration fields.

The workspace theme is authoritative after repository hydration. A
workspace-tagged local-storage mirror exists only to avoid an incorrect first
paint. Its owner marker is an opaque device-salted data-minimisation tag, not
an authentication token or security boundary; no raw account identifier is
persisted in the cache. Before identity and workspace hydration, the pre-paint
bootstrap can validate only the mirror's structure; it cannot prove that the
mirror belongs to the workspace that will become active, so the last valid
workspace theme may appear transiently. Runtime activation verifies the
device-salted owner tag, rejects and clears a mismatched mirror, and uses the
signed-out fallback until authoritative preferences hydrate. Storage failures
are best-effort, and the mirror never writes a preference into a repository.

## Runtime and repository boundary

`WorkbenchRuntime` binds one `WorkspaceDescriptor` and one
`LibraryRepositoryBundle` to a Pinia instance. The descriptor exposes:

- stable workspace and repository identities;
- `cloud`, `browser`, or `demo` location vocabulary;
- display label, read-only state, capabilities, and the highest adapter-local
  observation revision accepted by this runtime.

Each captured operation carries only the workspace ID, repository ID, and
activation generation. Replacing or invalidating a workspace advances the
activation generation. A late read or write may publish only when
`runtime.isCurrent(context)` remains true and its returned revision is
accepted. `repositoryRevision` is a monotonic adapter-local UI observation
token. It prevents this runtime from publishing an older response; it is not a
durable revision, a cross-client ordering guarantee, or an implicit mutation
precondition. A command that needs compare-and-swap semantics must carry an
explicit domain precondition. Queued commands capture their context when the
user requests them; they must never replay against a replacement workspace.

Pinia stores remain the reactive view/cache layer. Library stores may reconcile
optimistic state, tombstones, per-entity queues, and loading state, but they do
not instantiate a storage transport. Supabase clients, SQL ownership fields,
pagination, row decoding, and RPC details stay in the Cloud adapters.

## Domain contracts

Application code uses the transport-neutral shapes in
`shared/types/library.ts`. Domain records do not contain `user_id`; managed
covers do not overload a Supabase path field. The repository bundle is split by
semantic ownership:

- records: record-with-tracks creation, metadata and cover changes, collection
  removal, and durable cover cleanup;
- tracks: CRUD and ordered batch/CAS enrichment outcomes;
- crates: metadata plus atomic record membership;
- saved sets: ordered session history, autosave/manual save, and deletion;
- preferences: one coherent library-owned value;
- covers: resolution of typed cover references;
- observed view: a best-effort multi-domain read for diagnostics and adapter
  contracts.

The current Cloud observed view is assembled from multiple Supabase queries.
It is explicitly marked `non-atomic-observation` and can contain entities
observed on opposite sides of an external write. It must never be described or
used as an archive, backup, export snapshot, or transactional restore point. A
future coherent export requires a server-side transaction/RPC (or equivalent
backend primitive) before the backup work can rely on it.

Commands return `success`, `stale`, `conflict`, or `unavailable`. They accept an
explicit operation context and never accept a caller-supplied owner ID. A
successful result includes the authoritative domain value, decode issues, and
repository revision. Domain-specific atomicity and reconciliation must not be
flattened into a generic query-builder API.

## Covers

`CoverReference` has four explicit states:

- `none`;
- `external` URL;
- managed `cloud` asset with an optional fallback URL;
- managed `browser` asset with an optional fallback URL.

Components resolve a reference through the active repository. Resolution is
workspace leased: a URL that finishes after a workspace replacement or
component recycle is discarded. Cloud signed-URL caching is account-scoped,
bounded, and generation-reset; a Cloud adapter rejects browser-owned
references rather than treating their IDs as storage paths.

## Adapter behavior

The Cloud adapter maps strict Supabase rows at its edge, preserves account and
repository revision checks, and exposes only domain values. Authentication
changes invalidate Cloud work. They do not clear an active non-Cloud workspace.

The Demo adapter returns isolated seeded repository reads and explicit
`unavailable/read-only` outcomes for every mutation. Its stores hydrate through
the same semantic read interfaces as other backends. Preference changes are a
shared ephemeral overlay for the current Demo session and the main workspace
theme is restored when Demo is left. Demo is neither a mutable in-memory
library nor a persistence fallback.

Browser persistence is intentionally unavailable until its adapter can provide
transactional writes, strict codecs, durable health/recovery state, and the
same stale/conflict guarantees. Signed-out route access is a separate product
launch decision.

## Adding a backend

A new backend must:

1. map storage rows to the domain only at the adapter edge;
2. implement every semantic repository it claims as a capability and label
   multi-read consistency honestly;
3. enforce workspace leases and explicit domain preconditions inside
   mutations;
4. preserve record/track, crate membership, saved-set, and cover atomicity;
5. return typed disabled, conflict, stale, and transport outcomes;
6. pass the common observed-read contract, mutable concurrency contracts when
   writable, store regressions, and full verification gates;
7. document storage durability and recovery honestly in product-facing UX.

The contract suite lives with `app/repositories/library`. Cloud and Demo both
run the common non-atomic-observation and stale-work assertions; Demo separately
proves all mutations are read-only. Mutable adapters additionally retain the
existing store concurrency and reconciliation suites.
