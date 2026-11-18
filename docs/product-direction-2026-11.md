# Product direction: what Crate Guide can become

Date: 18 November 2026. Source baseline: `8984bfb` on `main`. This is a
product assessment and recommendation, not an implementation plan. Nothing in
it changes current behaviour or overrides the deferred-scope decisions in
`plans/README.md`.

## 1. Who Crate Guide is for

The demo library (Kerri Chandler, Floorplan, Leon Vynehall, Galcher Lustwerk,
Mella Dee) and the feature set point at one person: a **house/techno/disco DJ
who plays records**. Four sub-groups matter, in order of how much the product
can help them:

| Segment                                                        | Size   | Core pain                                                                                     |
| -------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| Hobbyist vinyl DJ, 100–1,000 records, plays at home or parties | Large  | Does not know the BPM/key of most records; packs by memory; forgets what is in the collection |
| Gigging vinyl DJ, 500–5,000 records                            | Small  | Packing the bag for a gig; finding the next record in the booth; remembering what worked      |
| Hybrid DJ (vinyl + Rekordbox/USB)                              | Medium | Has BPM/key for digital files but not for vinyl; wants one view of both                       |
| Collector who occasionally DJs                                 | Large  | Cataloguing is solved by Discogs; wants rediscovery and "what goes with what"                 |

What unites them: **vinyl has no metadata layer**. Rekordbox gives a digital DJ
BPM, key, waveform, cue points, history and smart playlists for free. A vinyl
DJ has a sticker on the sleeve and their memory. Every real pain above is a
missing-metadata pain or a "what did I do with this" pain.

Recommended positioning, in one line:

> **Crate Guide knows your records the way Rekordbox knows your files.**

Not "a collection manager" (Discogs owns that), not "a turntable simulator"
(a toy), but the metadata, planning and memory layer for a physical record
collection.

## 2. What the product does today, and how much value each part delivers

| Area                           | What exists                                                                                                                    | Value to the segments above                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discogs import                 | OAuth, folder selection, dedupe, re-import marks already-imported releases                                                     | **High.** This is the acquisition path and it works. One-way and manual: no "import what I bought since last time" and no mapping of Discogs folders to crates.                                                                                                                                                                                                                                           |
| Library (Records/Tracks)       | Virtualised lists, search, BPM/key/genre/playable filters, inspector, inline edit, manual records, cover upload, Evidence view | **Medium-high.** Solid, fast, well made. "Evidence" leaks internal vocabulary into a top-level toggle on the Tracks page. No physical location field, so the app cannot answer "where is this record on my shelf".                                                                                                                                                                                        |
| BPM & Key enrichment           | Rekordbox XML match, local-file tags, Essentia analysis of PCM WAV only, review table, fill-only writes, provenance            | **Medium for hybrids, low for everyone else.** The hardest problem the demographic has, and the current answer requires the user to already own audio files for their vinyl. Most vinyl DJs do not. The WAV-only decode envelope makes the local path serve a sliver of a sliver. The engineering (decode-safety policy, caches, leases, drafts, receipts) is far heavier than the user value it reaches. |
| Session (decks + suggestions)  | 1–4 decks, pitch fader, pitch-adjusted BPM and key, 70/30 harmony/tempo score, same-record exclusion, played exclusion         | **High kernel, wrong wrapper.** The scoring is genuinely good and vinyl-aware (you cannot play two tracks from one record on two decks). But it lives inside a desktop deck metaphor with no audio, so it is a rehearsal tool, not a booth tool. It is the most valuable logic in the codebase and the least accessible.                                                                                  |
| Turntable simulation           | SL-1200 platter, tonearm, strobe, 33/45, start/stop, finishes                                                                  | **Low utility, high delight.** It is finished. It should stay as a toggle and receive no further investment.                                                                                                                                                                                                                                                                                              |
| Crates                         | Named, coloured, described, record membership, list/cover view                                                                 | **Medium.** Correct primitive, but a crate is not yet a _gig_: no date, venue, record count against a bag limit, no link from a saved set, no track-level membership.                                                                                                                                                                                                                                     |
| Saved sets + transition rating | Autosave, named sets, 5-star rating per transition, set manager                                                                | **Low today, high potential.** Ratings are stored and never read again. Nothing feeds back into suggestions, nothing is exported, no statistics. The product collects the most interesting data a DJ generates and does nothing with it.                                                                                                                                                                  |
| Demo mode                      | Read-only seeded library across all routes                                                                                     | **High for conversion.** Keep.                                                                                                                                                                                                                                                                                                                                                                            |
| Deferred Local/offline/archive | Removed from production, recoverable from a tag                                                                                | **Correct call.** Agree with the July deferral. The one piece worth salvaging cheaply is plain export (section 4.3).                                                                                                                                                                                                                                                                                      |

Two cross-cutting observations:

1. **There is no product telemetry at all.** No counts of sign-ups, imports,
   enriched tracks, sessions saved. The repository has 2,500 tests and
   benchmark budgets for suggestion recomputation, but cannot answer "did
   anyone use this". Any roadmap needs a handful of privacy-respecting counters
   first.
2. **The engineering programme has outrun the product.** Eleven PRs landed on
   18 November alone, all performance, dependency and tooling work. The audit
   waves are sound, but the last user-visible feature was the turntable strobe
   in September. The ratio should flip.

## 3. The core loop to build around

```
own records  →  know their BPM/key  →  plan a set  →  pack the bag  →  play  →  log what worked  →  (feeds back into "know" and "plan")
```

Today the loop has two breaks: "know" fails for anyone without audio files,
and "log" is a dead end. Fixing those two is where almost all the available
value is.

## 4. Recommended plan

Ordered by value divided by effort. Each phase is independently shippable.

### Phase 0: Point the ship (one to two weeks)

- Write the positioning and segment table into the README so every later
  decision has a reference.
- Add minimal, aggregate, cookie-free telemetry: accounts created, records
  imported, tracks with BPM+key, sets saved, enrichment source used. Counts
  only, no per-user events. Surface them on a maintainer page or in the
  database, not a third party.
- Add a first-run checklist on the Session home for a new account: connect
  Discogs, import, add BPM & key, build a crate, plan a set, with a live "N%
  of your tracks have BPM and key" bar. The Tracks page already computes
  the missing-BPM count; make it the activation metric for the whole app.
- Rename the Tracks page "Evidence" toggle to something a DJ says, or move it
  into the inspector. Keep the internal name.
- Pause further infrastructure waves beyond what is already merged unless a
  user-facing phase needs them.

### Phase 1: Close the metadata gap (the biggest win)

This is the phase that makes Crate Guide useful to the large segments.

**1a. Analyse from the turntable (microphone or line-in).** Reuse the existing
Essentia worker, but feed it from `getUserMedia` instead of a decoded file.
The user plays the record, taps "Listen", the app captures 30 to 60 seconds of
PCM straight from Web Audio, runs `RhythmExtractor2013` and `KeyExtractor`,
shows BPM with confidence and a key with strength, and the user confirms.
No file, no decode-safety envelope, no format matrix. A phone on the
speaker gives usable BPM; a line-in from the mixer gives usable key. This
single feature turns enrichment from "for people who own the files" into
"for people who own the record", and most of the hard code already exists.

**1b. Tap tempo and a key picker, everywhere.** A tap-tempo button and a
Camelot wheel key picker in the track inspector, the record dialog and the
deck. Add an "annotate this record" mode that walks A1 to B2 while the record
plays. This is the fallback that works in a noisy room and costs days, not
weeks.

**1c. Community pressing data (the moat).** The same pressing has the same BPM
and key for every owner. Add an opt-in table keyed on Discogs release id plus
track position, storing user-contributed BPM/key values. Show "BPM 124, key
8A, agreed by 7 Crate Guide users" with a one-click accept into the fill-only
write path. Aggregate by median, reject outliers, let users withdraw. This is
user-generated data, not Discogs API content, so it sits outside the
unresolved Discogs classification, but write that down in a decision record
before shipping. Value compounds with every user and nothing else in the
space offers it.

**1d. Demote, don't delete, file analysis.** Keep Rekordbox XML as the hybrid
DJ's path and keep tags-only reads. Stop broadening the WAV-only decode
matrix; the microphone path makes it unnecessary.

### Phase 2: Make the suggestion engine usable where DJs are

**2a. The Bag.** A crate gains an optional gig (date, venue, notes) and a
"packed" state. A phone-first Bag view lists the packed records sorted by BPM
and key, large type, dark, one hand. Tap the record now playing; every other
record in the bag shows its compatibility score and the pitch percentage
needed, exactly as the deck suggestions do today. This is the existing
`getTrackSuggestions` with the candidate set narrowed to the bag and the UI
rebuilt for a booth. It is the single most useful screen the product can
have for a gigging DJ, and it is mostly reuse.

**2b. Set planner, with export.** Keep the deck view as "Plan a set" at home.
Add reordering of the history, an energy or BPM arc, and export of the set
list as text, Markdown and CSV for tracklists and social posts. "Pack this
set" creates or updates a crate with every record in it, which links planning
to the Bag.

**2c. Close the feedback loop.** Read the ratings that are already stored.
In scoring, add a bounded bonus for pairs the user has played before,
weighted by rating; in the suggestion card show "played after this 3×, avg
4.5★". In the inspector show a track's best-rated transitions in and out. The
data exists; only the read side is missing.

**2d. Leave the turntable simulation alone.**

### Phase 3: Collection intelligence

- **Location field** on records (shelf, box, bag) with search. Cheap and
  constantly used.
- **Incremental Discogs sync**: "import additions since last import" and
  optional mapping of Discogs folders to crates on import. The dedupe already
  exists; this is a filter and a UI.
- **Rediscovery**: records never played in any saved set, records not played in
  a year, a weekly "forgotten record" on the home screen. Collectors love
  this and it reuses saved-set data.
- **Collection statistics and gaps**: BPM histogram, key wheel coverage,
  genre spread, "you own nothing between 128 and 132 in 8A". Also feeds buying
  decisions.
- **Plain export**: the user's library as CSV and JSON, including their own
  BPM/key/location/ratings. The privacy page tells users to keep a copy and
  offers no way to make one. This is the cheap tenth of Plan 070 without
  archive restore, and it should be scoped to user-contributed fields until
  the Discogs portability decision is resolved.

### Phase 4 (only if Phases 1 to 3 land and usage justifies it)

Public, read-only set-list and crate pages for sharing; following other
users' public crates. Keep it small. Do not build social features before the
metadata and bag loops are proven.

## 5. What to stop or not start

- Accountless Local libraries, local-to-cloud copy, accountless Discogs,
  offline app shell: stay deferred. Agree with the July decision.
- Full portable archive with validated restore: replace with plain export.
- Broadening the local-file decode matrix (MP3/FLAC/AIFF): the microphone path
  makes it unnecessary for the target user.
- More turntable realism.
- Further infrastructure and tooling waves not required by a product phase.
- Multi-deck beyond two in the planner: four virtual decks with no audio is
  not a vinyl workflow. Keep the option, stop designing around it.

## 6. Sequencing and effort

| Phase | Items                                      | Rough effort | Depends on |
| ----- | ------------------------------------------ | ------------ | ---------- |
| 0     | Positioning, telemetry, checklist          | 1–2 weeks    | none       |
| 1b    | Tap tempo, key picker, annotate mode       | 1–2 weeks    | none       |
| 1a    | Microphone/line-in analysis                | 2–4 weeks    | none       |
| 2c    | Ratings feed suggestions                   | 1 week       | none       |
| 2a    | The Bag                                    | 3–4 weeks    | 0          |
| 2b    | Planner reorder and export                 | 1–2 weeks    | none       |
| 1c    | Community pressing data                    | 4–6 weeks    | 0, 1b      |
| 3     | Location, sync, rediscovery, stats, export | 4–6 weeks    | 2a         |

Phase 1b, 1a and 2c can start immediately and in parallel; none touches the
others' files. The Bag should follow once telemetry shows people reach the
session page with enriched tracks.

## 7. Success measures

- Share of tracks with both BPM and key, per account and overall. Target: from
  "mostly empty" to above 60% for active accounts within a quarter of Phase 1.
- Accounts that save at least one set within 30 days of first import.
- Crates marked as a gig and opened in the Bag view on a phone.
- Community-data acceptances per week once 1c ships.
- Returning weekly users, counted in aggregate.

## 8. Risks

- **Microphone analysis quality.** Key detection from a phone mic at a party
  will be weak; set expectations in the UI, show confidence, and lead with
  BPM. Line-in is the quality path; say so.
- **Community data and Discogs terms.** Record the classification before
  shipping. Store only user-entered values and the Discogs release id as a
  join key.
- **Mobile offline in the booth.** The Bag will be used where connectivity is
  poor. Phase 2a should keep the bag's data in memory once loaded and avoid
  network on tap. A real service worker remains deferred; do not promise
  fresh offline reload.
- **Appetite.** Phases 1a, 1c and 2a are each the size of one of the
  stabilisation PRs. The risk is not technical; it is continuing to spend the
  budget on waves instead.
