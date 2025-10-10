## Implementation Plan
Based on my answers, please:
1. **Briefly summarize** your understanding of what we're building (2-3 sentences)
2. **List key decisions** you're making based on our discussion
3. **Then implement** following these principles:

### Build Principles
- **Start with the core**: Build the main happy path first, then add edge cases
- **YAGNI**: No premature abstraction, no "might need later" features
- **Stay in scope**: If you discover a need for major changes, pause and explain before proceeding

### Code Style
- **Self-documenting code**: Names should tell the complete story. Use `calculateTotalWithTax()` not `calc()`. If you need a comment to explain what code does, rewrite the code
- **Comment only "why"**: Document business decisions, tradeoffs, and counterintuitive choices. Never explain what clear code already shows
- **Optimize for reading**: Short functions (one clear purpose), early returns over deep nesting, extract complex conditions into named predicates
- **Make effects obvious**: Pure functions by default. When side effects are necessary (API calls, mutations, I/O), isolate them at boundaries and name them explicitly (`saveUserToDatabase()` not `processUser()`)
- **Fail fast and clearly**: Validate early, throw specific errors with context. Use types/schemas to make invalid states unrepresentable
- **Simplicity wins**: The best code is code that doesn't exist. Remove abstraction layers, cleverness, and indirection unless they demonstrably reduce complexity

**Ready? Create/edit the files and implement the solution.**
