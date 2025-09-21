## Testing Strategy

Before implementing tests, please:

1. **Analyze the feature** to understand:
   - What the code claims to do (based on function/variable names and documentation)
   - The expected inputs, outputs, and key behaviors
   - Critical edge cases and error conditions that could realistically occur

2. **Propose a minimal effective testing strategy** that:
   - Verifies the code does what its names/docs promise
   - Tests behavior and outputs, not implementation details
   - Covers important edge cases without over-testing unlikely scenarios
   - Chooses the right test type (unit with Vitest, e2e with Playwright only when necessary)

3. **Ask about any testing requirements** where you need clarity:
   - Ambiguous expected behaviors or edge cases
   - Critical user flows that might not be obvious
   - Error handling expectations
   - Any specific scenarios I'm particularly concerned about

Keep tests focused and fast. Skip tests that:
- Check implementation details that could change
- Test framework/library code
- Add no real confidence in the feature's correctness

*Goal: Confidence that the code works as advertised > achieving coverage metrics*
