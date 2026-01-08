## Code Cleanup Pass

Review all modified files and apply these improvements in order:

### 1. Remove (Do First)

- **Dead code**: Commented-out blocks, unreachable code, unused functions/variables/imports
- **Debug artifacts**: console.logs, print statements, debug breakpoints, temporary test data
- **Redundant comments**: Anything describing what self-documenting code shows

### 2. Simplify Structure

- **Extract complexity**: Functions over 20 lines → smaller functions with single responsibilities
- **Flatten nesting**: Apply early returns, guard clauses, extract nested conditionals to named predicates
- **Consolidate duplication**: Extract repeated patterns into reusable functions
- **Replace magic values**: Numbers/strings → named constants with business meaning

### 3. Improve Names (Present as Suggestions)

**Format**: `oldName → newName // reason`

- Generic → Specific: `data → userProfile`, `process() → validateAndSaveOrder()`
- Abbreviations → Full words: `calc → calculate`, `ctx → context`
- Add units/types to ambiguous names: `timeout → timeoutMs`, `size → maxSizeBytes`

### 4. Final Polish

- **Consistent patterns**: Ensure similar operations use similar code structure
- **Sort/organize imports**: Group by standard lib → third party → local
- **Remove over-typing**: Keep only type annotations that prevent errors or clarify intent

### Preserve These

✓ "Why" comments explaining business decisions, tradeoffs, or counterintuitive approaches
✓ TODO/FIXME comments with dates and owner names
✓ External references (ticket numbers, documentation links)
✓ Warranty-voiding warnings ("Don't change this unless...")

### Output Format

1. **List proposed renames first** (I'll approve before you apply them)
2. **Apply all approved changes directly to the files**

**Note**: If cleanup would change public APIs or require changes in other files, flag it instead of doing it.
