## Generate Commit Message
Please:
1. Run `git diff --staged` to see staged changes
2. If nothing is staged, run `git add .` then `git diff --staged` to see all unstaged changes
3. Analyze the changes to understand what was accomplished
4. Write a **conventional commit** message following this format:

### Format
```
type(scope): description

- First key change or addition
- Second key change or addition
- Third key change or addition
```

### Rules
- **Type**: feat|fix|docs|style|refactor|test|chore|perf
- **Scope**: optional, the affected component/area in parentheses
- **Description**: imperative mood, lowercase, no period, under 72 chars
- **Body**: If the commit involves multiple related changes or non-trivial work, add a blank line followed by 3-6 concise bullet points (starting with `-`) describing the key changes in imperative mood
- **Do NOT use**: `!` suffix or `BREAKING CHANGE:` (we track these separately)

### When to Add Bullet Points
Add bullet points for:
- Features with multiple components or changes
- Refactors affecting several areas
- Fixes that required multiple adjustments
- Any commit where the description alone doesn't capture the scope

Skip bullet points for:
- Simple, single-purpose changes
- Obvious or trivial updates

### Examples
**With bullet points:**
```
refactor(ui): implement unified theme system with CSS custom properties

- Add CSS custom properties for consistent theming across light/dark modes
- Simplify theme configuration to use neutral color naming
- Update all auth and UI components to use new theme classes
- Streamline ThemePicker to focus on mode selection only
```

**Without bullet points:**
```
fix(api): handle null response from payment service
```

**Focus on the actual impact/purpose of the changes, not just what files were touched.**

**Do NOT commit or push.**

Reply only with the commit message.
