# AGENTS.md

## Mission

- Make the smallest correct change that solves the user request end-to-end.
- Prefer implementation + verification over long plans.
- Surface blockers quickly and include concrete next actions.

## Workflow

- Start by locating relevant files with `rg`/`rg --files`.
- Read surrounding code before editing to preserve existing patterns.
- Keep diffs focused; do not refactor unrelated areas unless requested.
- Run targeted checks after changes when possible (tests, lint, or typecheck relevant to touched code).
- If you cannot run verification, state exactly what was not run.

## Repo-Specific Rules

- Stack: Nuxt 4 + Vue 3 + TypeScript + Pinia + Tailwind.
- Respect Nuxt auto-imports; do not manually import symbols that are auto-imported.
- Use Tailwind utility classes and design tokens (`bg-background`, `text-foreground`, `border-border`); avoid ad-hoc styling patterns.
- Follow existing component naming and structure conventions in the codebase.
- Match existing store patterns (clear loading/error state, predictable actions, rollback for optimistic updates when needed).

## Commit Messages

- Always use Conventional Commits for every commit message.
- Format: `type(scope): short summary` (or `type: short summary` when no scope is needed).
- Use imperative, concise summaries.
- Valid examples: `feat(crates): add drag-and-drop ordering`, `fix: prevent duplicate record imports`.

## Git Safety

- Never discard or overwrite unrelated local changes.
- Do not amend commits unless explicitly requested.
- Do not commit unless the user asks you to commit.
