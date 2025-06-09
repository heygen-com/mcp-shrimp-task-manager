# Agent Behavior Update - Single Operation Principle

## Problem
Agents were automatically continuing with additional operations (like planning tasks) after completing a requested operation (like linking to JIRA).

## Solution
1. **Updated link_jira response** to explicitly state "No further action needed"
2. **Created behavior guides**:
   - `docs/AGENT_JIRA_LINKING_BEHAVIOR.md` - Specific guidance for JIRA linking
   - `docs/AGENT_SINGLE_OPERATION_PRINCIPLE.md` - General principle for all operations

## Key Changes

### Code Update
- Modified `src/tools/project/unifiedProject.ts`
- Added explicit completion message to link_jira responses
- Both successful and partial success cases now end with "No further action needed"

### Agent Guidance
- **Core Rule**: Execute ONLY the requested operation, then STOP
- No automatic task planning after linking
- No suggestions for next steps unless asked
- Wait for explicit user instructions

## Impact
Agents will now:
- ✅ Complete the requested operation
- ✅ Report the result
- ✅ Stop and wait for the next instruction
- ❌ NOT automatically plan tasks
- ❌ NOT suggest next steps
- ❌ NOT continue with analysis

## Example Behavior

**Before**: Link → Plan tasks → Analyze → Suggest steps
**After**: Link → Report success → STOP

This gives users full control over their workflow pace. 