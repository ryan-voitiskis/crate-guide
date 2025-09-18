## Code Cleanup Pass

Please clean up all modified files according to these criteria:

### Remove
- **Comments that describe what self-documenting code already shows** (keep only the "why" comments)
- **Dead code** - commented out code blocks, unused functions/variables
- **Debug statements** - console.logs, print statements, debug breakpoints
- **Redundant code** - repeated logic that could be extracted or simplified
- **Unused imports/dependencies**

### Simplify
- **Unnecessarily verbose syntax** to more concise idiomatic forms
- **Complex conditionals** - extract to well-named functions or simplify boolean logic
- **Redundant type annotations** (in TypeScript/Python) where they can be inferred
- **Excessive nesting** - use early returns, guard clauses, or extraction

### Improve Naming
- If renaming variables/functions would eliminate the need for comments, **suggest the renames** (I'll confirm)
- Replace generic names (data, info, temp, obj) with specific ones
- Use consistent naming conventions throughout

### Keep
- Comments explaining **why** something is done a certain way
- Comments for **non-obvious business logic**
- TODO comments that are still relevant
- Type annotations that improve clarity or catch errors
