# Rekordbox parser performance and safety

Plan 065 replaces the main-thread DOM parser with a bounded incremental Worker
pipeline. This protocol, deterministic corpus, and the numeric budgets below
were checked in before measuring the synchronous implementation.

## Approval and interpretation

- The repository maintainer broadly authorized implementation of the planned
  findings, including the generated scale corpus and measurement gate.
- Codex proposed these engineering limits and performance budgets; they were
  not independently selected by the maintainer and are not product latency
  promises.
- The compatibility oracle remains `parseRekordboxXml`. Production output must
  match its normal fixtures while refusing unsafe or out-of-policy XML.
- `parserPolicyVersion` describes accepted XML and limits.
  `sanitizedSnapshotVersion` separately describes the raw-location-free source
  data that can cross the Worker boundary and later be persisted by Plan 074.

## Deterministic corpus

`test/fixtures/rekordboxXmlScale.ts` generates exact 1,000, 10,000, and 100,000
track Rekordbox exports from a fixed algorithm. The corpus includes UTF-8 text,
named and numeric entities, percent-encoded file URIs, ignored attributes, and
ignored child elements. The checked-in manifest records byte sizes and SHA-256
digests so benchmark inputs cannot drift silently without a generator-version
and manifest update.

The large exports are generated on demand rather than committed as redundant
multi-megabyte XML blobs. They are still deterministic checked-in fixtures: the
generator, exact counts, version, byte sizes, and hashes are all repository
state.

## Supported limits and budgets

`shared/config/rekordboxXmlParser.json` is the source of truth. Production
accepts at most 128 MiB and 100,000 tracks, uses 256 KiB input chunks, and
bounds XML depth, markup, element names, attribute count/size, warning count,
location hints, and path segments.

The Chromium performance gate requires first progress within 1,000 ms,
progress at least every 1,000 ms while work continues, cancellation settlement
within 250 ms, and no attributable main-thread long task above 50 ms. Total
Worker budgets are 1,000 ms for 1k, 3,000 ms for 10k, and 15,000 ms for 100k.
The main-thread post-run heap-growth ceiling is 256 MiB when Chromium exposes a
heap metric; an unavailable metric is reported explicitly rather than inferred.

## Baseline protocol

Run the synchronous compatibility implementation in an isolated Node process
with Happy DOM and explicit garbage collection:

```bash
node --expose-gc --max-old-space-size=6144 node_modules/.bin/vite-node \
  scripts/benchmark-rekordbox-parser.ts 1000 10000 100000
```

For each size, record XML construction time, synchronous parse time, observed
heap before/input/parse snapshots, input SHA-256, output checksum, parsed count,
warnings, and errors. First-progress latency is explicitly `null` and
cancellation support is `false` for the synchronous baseline.

## Synchronous baseline

Pending the pre-optimization measurement run.
