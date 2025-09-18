## Generate Commit Message

Please:
1. Run `git diff --staged` to see staged changes
2. If nothing is staged, run `git add .` then `git diff --staged` to see all unstaged changes
3. Analyze the changes to understand what was accomplished
4. Write a **conventional commit** message following this format:

### Format
type(scope): description
[optional body]

### Rules
- **Type**: feat|fix|docs|style|refactor|test|chore|perf
- **Scope**: optional, the affected component/area in parentheses
- **Description**: imperative mood, lowercase, no period, under 72 chars
- **Do NOT use**: `!` suffix or `BREAKING CHANGE:` (we track these separately)

### Examples
- `feat(auth): add oauth2 login support`
- `fix(api): handle null response from payment service`
- `refactor: extract validation logic to separate module`
- `docs: update API examples for clarity`

**Focus on the actual impact/purpose of the changes, not just what files were touched.**

**Do NOT commit or push.**
