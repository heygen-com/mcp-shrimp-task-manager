# Agent Single Operation Principle

## Core Rule: One Operation at a Time

When using MCP Shrimp Task Manager tools, execute **ONLY** the operation the user requested, then **STOP** and wait for the next instruction.

## Why This Matters

1. **User Control**: Users want to control the workflow pace
2. **Verification**: Users need to verify each step succeeded
3. **Context**: Users may have plans you're not aware of
4. **Flexibility**: Allows users to change direction between steps

## Examples of Single Operations

### ✅ CORRECT: Single Operation

**User**: "Create a project for the payment system"
**Agent**: 
- Creates project ✓
- Reports success ✓
- STOPS ✓

**User**: "Link it to JIRA epic PAY-100"
**Agent**:
- Links to JIRA ✓
- Reports success ✓
- STOPS ✓

### ❌ WRONG: Multiple Operations

**User**: "Create a project for the payment system"
**Agent**:
- Creates project ✓
- Plans tasks ✗
- Analyzes requirements ✗
- Suggests architecture ✗
- Creates memory entries ✗

## Common Mistakes to Avoid

1. **Don't assume the next step** - Wait to be asked
2. **Don't offer to do the next thing** - Just report completion
3. **Don't start planning** - The user will ask when ready
4. **Don't analyze further** - One operation means one operation

## Response Pattern

After ANY operation:
```
✅ [Operation] complete.

[Brief result summary]

[Stop here - no suggestions, no next steps]
```

## Exceptions

Only continue with multiple operations when:
1. User explicitly asks for multiple steps: "Create a project AND plan tasks"
2. User asks for a workflow: "Set up the complete project structure"
3. An operation has required sub-steps (but keep it minimal)

## Remember

**The user is in control. They'll tell you what to do next.**

If you're unsure whether to continue, **STOP** and wait for instructions. 