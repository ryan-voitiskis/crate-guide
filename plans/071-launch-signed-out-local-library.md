# Plan 071: Launch the signed-out Local library experience

> **Executor instructions**: Enable signed-out workbench routes only after
> browser persistence and portable recovery pass. Use calm, exact language:
> local data is saved in this browser but not copied/backed up by Crate Guide.
> Authentication must never switch, upload, merge, or clear the active library.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/middleware/auth.global.ts app/utils/authRoutes.ts app/app.vue app/composables/useUserData.ts app/repositories app/components/layout app/pages/settings.vue app/pages/login.vue app/pages/auth/finalising.vue app/pages/privacy.vue app/pages/terms.vue test/e2e`

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: Plans 058, 062, 063, 068, 069, and 070
- **Category**: direction / product UX / routing
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: TODO

## Why this matters

An account is not needed for collection management, sessions, Rekordbox/local
enrichment, covers, crates, sets, or preferences. It is needed for a cloud
library and currently for Discogs credential custody. The launch must make the
storage consequence clear without nagging or implying browser persistence is
unsaved, cloud-backed, or guaranteed.

## Current state

- `auth.global.ts` redirects every non-public workbench route to login.
- `app.vue` always runs `useUserData`, which bootstraps Supabase-backed stores.
- `StatusWorkbench.vue` conflates network state with `Offline mode` and calls
  every non-demo workspace `Local-first`; `NavMain.vue` always says `Library online`.
- Settings shows danger actions only for a Supabase user/demo and has no
  Storage & backup section.
- There is no service worker; this plan must not promise fresh offline reload.

## Product contract

| State                | Library/location signal | Backup signal        | Connectivity/behavior                 |
| -------------------- | ----------------------- | -------------------- | ------------------------------------- |
| Signed out + browser | `This browser`          | `Not backed up`      | online Local product                  |
| Signed in + browser  | `This browser`          | `Not backed up`      | Local remains active; cloud available |
| Signed in + cloud    | `Cloud library`         | `Export recommended` | online cloud product                  |
| Either + demo        | `Demo`                  | `Read-only`          | seeded/disposable                     |
| Offline + browser    | `This browser`          | `Not backed up`      | `Offline`; loaded Local writes work   |
| Offline + cloud      | `Cloud library`         | `Export recommended` | `Offline — unavailable`; no queue     |

Location/backup and connectivity are independent, simultaneously visible
signals. Going offline must never replace or hide `Not backed up`.

## Commands you will need

| Purpose   | Command                | Expected on success                    |
| --------- | ---------------------- | -------------------------------------- |
| Nuxt      | `npm run test:nuxt`    | all pass                               |
| E2E       | `npm run test:e2e`     | signed-out/local/auth transitions pass |
| Browser   | `npm run test:browser` | persistence/backup/failure UX pass     |
| Full gate | `npm run verify`       | exit 0                                 |

## Scope

**In scope**: route/bootstrap/workspace chooser, location/status panel, settings
Storage & backup, local clear/recovery, auth transition decisions, empty-library
actions, storage persistence/estimate UX, privacy/terms/README, accessibility
and Chromium/Firefox/WebKit plus real-Safari capability/E2E tests.

**Out of scope**: automatic sync, cloud merge/copy (Plan 072), accountless
Discogs (Plan 073), installability/fresh offline reload (Plan 076), or calling
browser storage encrypted/guaranteed.

## Git workflow

- Branch: `codex/071-launch-signed-out-local-library`
- Commit: `feat(workbench): launch signed-out local libraries`

## Steps

### Step 1: Replace login-first with a named workspace/location choice

On first run with no active workspace show three equal, accessible choices:

- **Use this browser** — “No account needed. Your records, tracks, crates, sets,
  settings and uploaded covers are saved in this browser and are not copied to
  the Crate Guide database.”
- **Open a cloud library** — sign in for Crate Guide-hosted, cross-device data.
- **Explore the demo** — read-only sample.

Add one consequence line: clearing site data, private browsing, losing this
profile/device, or browser eviction can remove it; export a backup or add cloud
storage whenever desired. Probe a committed IDB write before offering success.

Expose every valid Local workspace by user-visible name, last successful write,
counts, and storage health. Default the first to `Local library`; restored/new
collisions receive an editable `Local library 2`-style name. Provide Rename,
Open, Export, and Delete (with exact workspace/count confirmation). Never expose
raw IDs as names.

Use this startup matrix:

| Durable marker/session state                                | Startup result                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| valid browser marker + intact manifest                      | open that named Local workspace, whether signed in or out                                  |
| valid cloud marker + same authenticated account             | open that cloud library                                                                    |
| cloud marker + signed out/different account                 | scrub in-memory cloud materialization and show chooser; do not auto-open a Local workspace |
| missing/corrupt marker + one or more intact Local manifests | show named chooser with recovery state; do not guess or delete                             |
| marker names missing/corrupt Local manifest                 | show recovery/other intact workspaces; never recreate over it                              |
| no marker/workspace, existing pre-launch authenticated user | preserve the cloud default once during migration                                           |
| no usable workspace/session                                 | show the three first-run choices                                                           |

Keep the versioned active-selection marker outside portable library content.
Browser markers reference the Local workspace UUID. Cloud markers use a
device-salted fingerprint of the prior authenticated user, not a raw account ID,
and are cleared on explicit sign-out; the fingerprint is data minimization, not
an authentication control. Current server auth still authorizes every cloud read.

**Verify**: fresh, existing-local, unavailable-IDB, and existing-session E2E
choose exactly the matrix result; zero/one/multiple Local workspaces and
missing/corrupt markers never auto-delete or reveal an unintended library.

### Step 2: Make workbench routes workspace-aware

Allow normal library routes signed out when a valid browser workspace is active.
Keep auth/callback/legal rules and safe redirect handling. Bootstrap the active
repository before global dialogs/pages. Do not instantiate cloud data clients
when a deliberate local-only configuration is active.

Signing in while local stays local and reveals cloud as an option. Signing out
from cloud opens a chooser; it must not silently reveal/switch to an older local
workspace. Signing out scrubs cloud Pinia state, private object URLs, and
identity-bound caches from memory without deleting server data or any Local
workspace. Account replacement never clears local workspaces.

All explicit switches use one transition guard:

| Active work                               | Required result before activation                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| pending repository write                  | block and await its owned success/failure; never abandon an ambiguous write                      |
| dirty editor/create dialog                | offer Stay or Discard; no implicit save                                                          |
| unsaved session/set state                 | offer Save, Discard, or Cancel; switch only after the chosen action settles                      |
| enrichment/import/audio analysis          | save the valid draft where supported, or explicitly cancel and await Worker/operation settlement |
| export/restore/copy/delete/schema upgrade | block during atomic phase; otherwise explicit cancel must finish rollback/cleanup                |

After confirmation, close global UI, invalidate the outgoing workspace operation
generation, revoke its object URLs, then activate the new repository. Every
late fetch/mutation/progress/toast must prove the old operation context and must
not publish into the new workspace.

**Verify**: route/auth A/B/null matrix passes with no implicit workspace change.

### Step 3: Add persistent location and storage health UX

Replace ambiguous footer/nav copy with simultaneous location, backup, and
connectivity signals. The location control opens a compact panel with workspace location,
automatic-cleanup protection status, approximate use/quota, last successful
write, last export created, changes since export, Export backup, and switch/add
cloud actions.

Call `navigator.storage.persist()` only after the first meaningful create/import
under a user gesture. Label results `Protected from automatic cleanup`,
`Browser-managed`, or `Unknown`; state that none protects against manual clearing
or device loss.

**Verify**: granted/denied/unsupported/estimate-error states remain usable and
truthful.

### Step 4: Add nonblocking backup reminders

Always show the concise `Not backed up` status. Add an amber, dismissible reminder
for a nonempty never-exported library after 24 hours or 25 content revisions,
whichever comes first; after export, remind when at least one change exists and
30 days pass or 100 content revisions accrue. Store policy state locally and test clock/
revision edges. Never show a launch modal. Surface Export first again before
destructive actions.

**Verify**: reminder policy tests and accessibility announcements pass.

### Step 5: Build Storage & backup and destructive recovery

Add Settings before Account. Show exact counts for local records, tracks, crates,
sets, and cover bytes. Clear analysis cache separately. Local delete offers
Export first, requires an exact confirmation, transactionally deletes only that
workspace, broadcasts reset, and cannot affect cloud/account data.

Account deletion copy states it removes cloud account/library/integrations only,
not local workspaces/downloaded exports. IDB write failure moves the UI to the
Plan 069 read-only recovery screen: retry, export readable data, restore, switch,
or start new—never continue phantom edits.

**Verify**: destructive-scope and failure recovery browser tests pass.

### Step 6: Align acquisition, privacy, terms, and offline wording

Local empty state prioritizes Restore backup and Add manually. Discogs explains
the current credential gate until Plan 073. Privacy distinguishes browser/cloud/
demo metadata and covers; app delivery/external cover requests are not described
as “nothing leaves your device.” Say an already loaded browser library can work
offline, but fresh offline reopening is not yet guaranteed.

**Verify**: docs/convention, Nuxt, E2E, browser, and full gates pass.

### Step 7: Publish and test the supported-browser contract

At release time publish the exact stable Chrome/Edge, Firefox, desktop Safari,
and mobile Safari versions exercised. Run the durable storage, Blob, schema
upgrade, quota/failure, multi-page invalidation, and auth/switch matrix through
Playwright Chromium/Firefox/WebKit, plus a manual real-Safari macOS/iOS smoke
because WebKit automation is not Safari proof. Unsupported/missing capabilities
must show the fail-closed chooser/recovery path, not silently use memory.

**Verify**: engine matrix is CI-gated, real-Safari evidence is dated, and the
support page distinguishes automated engine coverage from device/browser smoke.

## Test plan

First run; zero/one/multiple named workspaces; missing/corrupt active marker;
rename/delete/switch; reload; private/IDB unavailable; storage persistence outcomes;
signed-out routes; sign-in while local; sign-out from cloud; A/B replacement;
dirty dialog/session/workflow and pending-write switch guards; late outgoing
completion; offline local/cloud; quota/write failure; workspace apparently missing; reminder
clock/revisions; local/account deletion scope; responsive/keyboard/screen-reader
status; browser-engine matrix; no Supabase calls in configured local-only mode.

## Done criteria

- [ ] Core workbench functionality is usable signed out against durable browser storage.
- [ ] Users continuously know where data lives and that Crate Guide has not backed up local data.
- [ ] Auth/network changes never switch, upload, merge, delete, or mislabel a library implicitly.
- [ ] Named Local workspace selection/recovery and every explicit switch preserve pending or dirty work safely.
- [ ] Backup, write-failure, storage-health, and destructive UX are explicit and accessible.
- [ ] The published browser matrix and fail-closed capability fallback are verified.
- [ ] No fresh-offline, encryption, or durability guarantee is overstated.

## STOP conditions

Stop if signed-out routing can expose a cloud repository, if an IDB failure
falls back to memory, if launch would occur without portable export/restore, or
if legal/privacy wording cannot distinguish application delivery and optional
integrations from library storage.

## Maintenance notes

Treat `This browser` as product vocabulary, not `guest`. Authentication and
active workspace selection remain independent in every future flow.
