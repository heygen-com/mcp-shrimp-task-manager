# Decision Recording Guidance

## When to Record a Decision Memory

You've just received a clear, definitive response from the user. This is a perfect moment to capture this decision for future reference.

### Automatic Decision Recording Triggers:
- User answered "yes" or "no" to a specific question
- User chose between multiple options you presented
- User provided specific requirements or constraints
- User clarified their preferences or approach
- User made a technical or architectural choice

### What Makes a Good Decision Memory:
1. **Context**: What question or choice was presented?
2. **Decision**: What did the user decide?
3. **Reasoning**: Why did they make this choice (if provided)?
4. **Impact**: How will this affect the project?

### Example Decision Memory:
```
Question: "Should we use TypeScript strict mode for this project?"
Decision: User chose to enable TypeScript strict mode
Reasoning: They want to catch more errors at compile time and improve code quality
Impact: All TypeScript files will need proper type annotations
```

**Action Required**: Use the `record_memory` tool with type "decision" to capture this choice. 