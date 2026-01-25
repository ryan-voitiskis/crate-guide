# Implementation Orchestration Prompt

Use this prompt to guide an agent through systematic implementation of the Crate Guide improvements documented in this directory.

---

## Context

**Project**: Crate Guide - DJ vinyl record management app
**Stack**: Nuxt 4, Vue 3, Pinia, Supabase, TypeScript, Tailwind
**Location**: `/Users/vz/projects/crate-guide`

This directory contains 6 analysis documents produced by a thorough codebase review. Each document identifies specific issues with file paths, line numbers, and proposed fixes.

---

## Document Index

| File | Purpose | Priority |
|------|---------|----------|
| `01-architecture-analysis.md` | Codebase overview, patterns, concerns | Reference |
| `02-security-enhancements.md` | Security vulnerabilities and fixes | HIGH |
| `03-bug-fixes.md` | Bugs with severity ratings | HIGH/MEDIUM |
| `04-code-quality-improvements.md` | Type safety, duplication, complexity | MEDIUM |
| `05-feature-proposals.md` | New feature ideas with roadmap | LOW |
| `06-test-coverage-gaps.md` | Testing gaps and recommendations | MEDIUM |

---

## Orchestration Instructions

### Principle: Minimize Context, Maximize Parallelism

Each implementation task should be delegated to a subagent with a focused, self-contained prompt. The orchestrating agent should:

1. **Never read full documents into context** - only reference specific sections
2. **Launch parallel subagents** for independent tasks
3. **Batch related fixes** that touch the same files
4. **Verify after each phase** before proceeding

---

## CRITICAL: Verification Gates

**DO NOT proceed to the next phase until the current phase passes all checks.**

After EVERY phase completion:

```bash
# 1. Run full test suite - MUST pass
npm run test:run

# 2. Type check - MUST pass
npm run typecheck

# 3. Review changes before committing
git diff --stat
git diff <changed-files>

# 4. Verify no unintended changes
git status
```

**If tests fail:**
1. STOP immediately
2. Debug the failure
3. Fix before proceeding
4. Re-run verification

**Critical Path Dependencies:**
- Phase 1 (Security) → Must complete before any other work
- Phase 2 (Bugs) → Depends on Phase 1 passing
- Phase 3 (Quality) → Can run after Phase 2
- Phase 4 (Tests) → Can run parallel to Phase 3
- Phase 5 (Refactor) → Depends on Phase 4 tests existing
- Phase 6 (Features) → Only on explicit user request

---

## CRITICAL: Conventional Commits

**All commits MUST follow conventional commit format.**

### Format
```
<type>(<scope>): <description>

[optional body]

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Types (use exactly these)
| Type | When to Use |
|------|-------------|
| `fix` | Bug fixes, security patches |
| `feat` | New features |
| `refactor` | Code changes that neither fix bugs nor add features |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Build, config, tooling changes |

### Scopes (use these or similar)
`security`, `stores`, `components`, `utils`, `api`, `edge-functions`, `tests`

### Examples
```bash
# Security fix
git commit -m "fix(security): prevent error disclosure in Edge Functions

- Replace JSON.stringify(e) with generic error response
- Add console.error for server-side debugging

Co-Authored-By: Claude <noreply@anthropic.com>"

# Bug fix
git commit -m "fix(stores): use null checks for track key to include C Major

Key 0 represents C Major and was incorrectly filtered by falsy check.

Co-Authored-By: Claude <noreply@anthropic.com>"

# Test addition
git commit -m "test(stores): add missing tests for discogsAuthStore

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Commit Timing
- Commit after EACH phase passes verification
- Never batch multiple phases into one commit
- Atomic commits enable easier rollback if issues arise

---

## Phase 1: Security Fixes (Priority: CRITICAL)

Already completed in initial pass. Verify with:
```bash
git diff supabase/functions/
```

If not applied, launch subagents for each:

### Subagent 1A: Error Disclosure
```
Read docs/tmp/02-security-enhancements.md section "1.1 Edge Function Error Information Disclosure"
Fix the 3 Edge Functions listed. Change JSON.stringify(e) to generic error response.
Files: supabase/functions/get-discogs-*/index.ts, authenticated-discogs-request/index.ts
```

### Subagent 1B: CORS + SSRF
```
Read docs/tmp/02-security-enhancements.md sections "1.2 CORS Wildcard Origin" and "1.3 Missing URL Validation"
Fix CORS in _shared/cors.ts. Add URL validation to authenticated-discogs-request/index.ts.
```

### Subagent 1C: Module Caching
```
Read docs/tmp/02-security-enhancements.md section "2.2 Remove Edge Function Module-Level Caching"
Refactor supabase/functions/_shared/supabaseHelpers.ts to remove module-level caching.
Update all consumer files.
```

---

## Phase 2: Bug Fixes (Priority: HIGH)

### Subagent 2A: Critical Bug (if not already fixed)
```
Read docs/tmp/03-bug-fixes.md section "BUG-001: Falsy Key Check"
Fix app/stores/tracksStore.ts:238 - change falsy checks to null checks.
Add test case for key=0 in tracksStore.test.ts.
Run: npm run test:run
```

### Subagent 2B: Session Store Timeout
```
Read docs/tmp/03-bug-fixes.md section "BUG-002: Session Auto-Save Timeout"
Convert autoSaveTimeout to ref in app/stores/sessionStore.ts:337.
Note: isAutoSaving already exists at line 63.
```

### Subagent 2C: Error Logging
```
Read docs/tmp/03-bug-fixes.md section "EDGE-001: Empty Error Catch Blocks"
Add console.error to catch blocks in:
- app/stores/recordsStore.ts
- app/stores/tracksStore.ts
- app/stores/cratesStore.ts
Pattern: } catch (error) { console.error('Context:', error); toast.error('...') }
```

---

## Phase 3: Code Quality (Priority: MEDIUM)

### Subagent 3A: Type Assertions
```
Read docs/tmp/04-code-quality-improvements.md section "QUAL-001"
Add type guards or Zod validation to replace 'as' assertions in stores.
Focus on: recordsStore.ts:43, tracksStore.ts:48, sessionStore.ts:420
```

### Subagent 3B: Non-Null Assertions
```
Read docs/tmp/04-code-quality-improvements.md section "QUAL-002"
Fix non-null assertions in app/utils/keyFunctions.ts at lines 144, 248, 310.
Add explicit null checks with error throws.
```

### Subagent 3C: TODO Cleanup
```
Read docs/tmp/04-code-quality-improvements.md section "QUAL-011"
Review each TODO and either implement or remove with explanation:
- app/utils/keyFunctions.ts:1,7,14
- app/components/records/CardRecordShort.vue:45
- app/components/records/DialogTrackEdit.vue:17
- app/components/records/DialogRecordDetails.vue:342
- app/components/tracks/DialogTrackFilters.vue:8,13,24
```

---

## Phase 4: Test Coverage (Priority: MEDIUM)

### Subagent 4A: Untested Stores
```
Read docs/tmp/06-test-coverage-gaps.md section "GAP-003: Untested Stores"
Create test files for:
- app/stores/__tests__/discogsAuthStore.test.ts
- app/stores/__tests__/recordDetailsStore.test.ts
- app/stores/__tests__/trackEditStore.test.ts
Follow existing test patterns in the __tests__ directory.
```

### Subagent 4B: Untested Utilities
```
Read docs/tmp/06-test-coverage-gaps.md section "GAP-005: Untested Utilities"
Create tests for high-priority utilities:
- app/utils/typeGuards.ts → typeGuards.test.ts
- app/utils/discogs-validation.ts → discogs-validation.test.ts
```

### Subagent 4C: API Endpoint Test
```
Read docs/tmp/06-test-coverage-gaps.md section "GAP-002: Server API Endpoint"
Create server/api/beatport/search.test.ts with:
- 400 for missing query params
- Successful parse of __NEXT_DATA__
- 429 rate limit handling
```

---

## Phase 5: Refactoring (Priority: LOW)

### Subagent 5A: Extract Suggestion Logic
```
Read docs/tmp/04-code-quality-improvements.md section "QUAL-006"
Extract pure functions from sessionStore.ts getSuggestionsForDeck():
- filterByBpmReach()
- filterAlreadyPlayed()
- scoreTrack()
Create app/utils/trackSuggestions.ts with these functions.
Update sessionStore to use them.
```

### Subagent 5B: CRUD Store Pattern (Optional)
```
Read docs/tmp/04-code-quality-improvements.md section "QUAL-004"
Evaluate creating a generic CRUD store factory.
This is optional - only if significant time savings justify the abstraction.
```

---

## Phase 6: Features (Priority: LOW - User Discretion)

Features should only be implemented upon explicit user request. Reference:
- `docs/tmp/05-feature-proposals.md`

Quick wins (if requested):
- FEAT-003: Session export (2 hours)
- FEAT-006: Record condition tracking (2 hours)
- FEAT-010: Keyboard navigation (4 hours)

---

## Verification Commands

After each phase:
```bash
# Run tests
npm run test:run

# Type check
npm run typecheck

# Check for uncommitted changes
git status

# Review specific changes
git diff <file>
```

---

## Commit Strategy

**Follow the Conventional Commits format defined above. Every commit must pass verification first.**

### Per-Phase Commits (after verification passes)

```bash
# Phase 1 - ONLY after npm run test:run && npm run typecheck pass
git add supabase/functions/
git commit -m "$(cat <<'EOF'
fix(security): harden Edge Functions

- Prevent error object disclosure to clients
- Restrict CORS to SITE_URL origin
- Add URL validation to prevent SSRF
- Remove module-level caching that could leak data

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Phase 2 - ONLY after verification passes
git add app/stores/
git commit -m "$(cat <<'EOF'
fix(stores): correct null checks and improve error handling

- Use == null for key checks (key 0 is valid C Major)
- Convert autoSaveTimeout to ref for proper lifecycle
- Add console.error to catch blocks for debugging

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Phase 3 - ONLY after verification passes
git add app/utils/ app/components/
git commit -m "$(cat <<'EOF'
refactor: improve type safety and resolve TODOs

- Replace type assertions with proper guards
- Fix non-null assertions in keyFunctions
- Address or document TODO comments

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Phase 4 - ONLY after verification passes
git add app/stores/__tests__/ app/utils/*.test.ts server/
git commit -m "$(cat <<'EOF'
test: expand test coverage for stores and utilities

- Add tests for discogsAuthStore, recordDetailsStore, trackEditStore
- Add tests for typeGuards and discogs-validation utilities
- Add API endpoint tests for beatport search

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Phase 5 - ONLY after verification passes
git add app/utils/trackSuggestions.ts app/stores/sessionStore.ts
git commit -m "$(cat <<'EOF'
refactor(session): extract track suggestion logic

- Move filtering and scoring to pure utility functions
- Improve testability of suggestion algorithm

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### IMPORTANT: Never Skip Verification
If tests fail or typecheck errors occur, DO NOT COMMIT. Fix the issues first.

---

## Notes for Orchestrating Agent

### Before Starting
1. **Check git status first** - Some fixes may already be applied
2. **Run `npm run test:run`** - Establish baseline (should be 666+ tests passing)
3. **Read this entire prompt** - Understand the full scope before delegating

### During Execution
4. **STOP AND VERIFY after each phase** - This is non-negotiable
5. **Run tests after each subagent completes** - Catch regressions immediately
6. **Don't parallelize file conflicts** - If two tasks touch the same file, run sequentially
7. **Keep subagent prompts focused** - One clear task per agent
8. **Reference docs by section** - Never load full documents into context

### Critical Path Enforcement
9. **Phase 1 must complete before Phase 2** - Security is foundational
10. **Never proceed if tests fail** - Fix failures before continuing
11. **Commit after each phase passes** - Atomic commits enable rollback
12. **User approval before features** - Only implement Phase 6 on explicit request

### Context Management
13. **Delegate aggressively** - Use subagents for all implementation work
14. **Summarize subagent results** - Don't re-read files the subagent already modified
15. **Trust but verify** - Run tests to confirm subagent work succeeded

---

## Current Status

As of initial analysis:
- [x] Phase 1: Security fixes applied
- [x] Phase 2A: Critical bug (key=0) fixed
- [ ] Phase 2B-C: Remaining bug fixes
- [ ] Phase 3: Code quality
- [ ] Phase 4: Test coverage
- [ ] Phase 5: Refactoring
- [ ] Phase 6: Features (user discretion)

Check `git status` and `git diff` to verify current state before proceeding.
