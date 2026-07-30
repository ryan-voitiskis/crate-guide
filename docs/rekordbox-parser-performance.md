# Rekordbox parser performance and safety

Plan 065 replaces the main-thread DOM parser with a bounded incremental Worker
pipeline. This protocol, deterministic corpus, and the numeric budgets below
were checked in before measuring the synchronous implementation.

## Authorization and interpretation

- The repository maintainer broadly authorized implementation of the planned
  findings, including the generated scale corpus and measurement gate.
- Codex proposed these engineering limits and performance budgets; they were
  not independently selected or accepted by the maintainer and are not product
  latency promises.
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

## Checked-in engineering limits and budgets

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
Vitest runs browser files serially so unrelated Worker, IndexedDB, and CPU-heavy
fixtures do not contend with these calibrated wall-clock samples.

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

The baseline was captured on 23 July 2026 on an Apple M5 with 24 GiB memory,
Node 24.14.0, and Happy DOM 20.10.6. Each size ran in a fresh process after the
protocol commit, with an 8 GiB V8 heap ceiling for 100k. These Node figures
characterize the algorithm's blocking/allocation shape; they are not browser
latency promises.

|  Tracks | Input bytes | XML build | Synchronous parse | Observed heap growth | Progress / cancel  |
| ------: | ----------: | --------: | ----------------: | -------------------: | ------------------ |
|   1,000 |     494,838 |   0.95 ms |          56.43 ms |     65,950,368 bytes | none / unsupported |
|  10,000 |   4,956,925 |   7.08 ms |         402.43 ms |    648,248,296 bytes | none / unsupported |
| 100,000 |  49,667,766 |  73.43 ms |       6,925.24 ms |  6,245,735,864 bytes | none / unsupported |

All three parses returned their declared count without warnings or errors. The
output checksums are pinned in `shared/config/rekordboxXmlParser.json`; input
checksums are pinned in the fixture manifest. The 100k run demonstrates why a
full DOM in a Worker would be insufficient: it would move roughly 6.2 GB of
observed allocation off the UI thread without fixing the underlying memory
model.

## Streaming Worker result

The production path reads 256 KiB `File` slices, transfers each `ArrayBuffer`
only after the previous chunk is acknowledged, decodes UTF-8 incrementally,
and tokenizes the required XML attributes without retaining the raw document
or constructing a DOM. The Worker retains one normalized track object per
result plus bounded path segments until the common relative-location prefix is
known. Before crossing the boundary, absolute locations are cleared; result
batches contain only versioned sanitized tracks and bounded warnings.

The first Chromium run after implementation produced the following result on
the same Apple M5. Durations are observations, while the looser limits above
remain the actual checked-in gates.

|  Tracks | First progress | Longest progress gap | Total Worker time | Main-thread long task | Output checksum |
| ------: | -------------: | -------------------: | ----------------: | --------------------: | --------------: |
|   1,000 |        30.1 ms |              30.1 ms |           58.0 ms |                  none |      `c9976222` |
|  10,000 |        23.5 ms |              39.4 ms |          574.1 ms |                  none |      `20fdd99f` |
| 100,000 |        26.3 ms |             113.3 ms |        6,124.2 ms |                  none |      `ad02ecb7` |

The checksum is an incremental FNV-1a 32-bit checksum over declared entries,
warnings, errors, and every ordered sanitized track. It avoids constructing a
second full serialized snapshot in the browser. Chromium exposed only a
coarsened `performance.memory` value in this run, so the test reported zero
observable growth and does not present that as a precise allocation result.

Cancellation settled in 11.5 ms immediately after start, within timer
resolution after first progress, and in 5.5 ms after parsing while result
batches were beginning. The test also sends duplicate `end` and late `chunk`
messages directly to the Worker and requires exactly one terminal response.

## Parser and boundary policy

- One UTF-8 XML 1.0 declaration is allowed only at the browser-compatible
  document position. Multibyte code points may span input chunks.
- The in-repository tokenizer decodes only the five predefined XML entities and
  valid numeric character references. DTD, DOCTYPE, entity declarations,
  unknown entities, invalid UTF-8, invalid XML characters, and malformed
  structures are rejected with fixed error categories.
- File bytes, track count, nesting, complete or partial markup, attributes,
  element names, entity length, warnings, path segments, and relative hints are
  all bounded. Error messages do not interpolate file contents or private
  paths.
- The main-thread client validates operation IDs, monotonic progress, declared
  count consistency, batch ordering, versions, warning bounds, and the absence
  of raw locations before accepting completion. Cancellation has a hard
  termination fallback below the checked-in 250 ms engineering budget.
