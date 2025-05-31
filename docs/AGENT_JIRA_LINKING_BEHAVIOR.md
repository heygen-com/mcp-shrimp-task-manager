# AGENT BEHAVIOR: JIRA Linking Operations

## ⚠️ CRITICAL: STOP After Linking!

When a user asks you to link a project to a JIRA epic, you should:

1. **Execute the link_jira command**
2. **Report the result**
3. **STOP - Do NOT continue with other operations**

## ❌ WRONG Behavior

```
User: Link this to TT-206

Agent: 
1. Links to JIRA ✓
2. Plans tasks ✗ (DON'T DO THIS)
3. Analyzes project ✗ (DON'T DO THIS)
4. Suggests next steps ✗ (DON'T DO THIS)
```

## ✅ CORRECT Behavior

```
User: Link this to TT-206

Agent:
1. Links to JIRA ✓
2. Reports success ✓
3. STOPS ✓
```

## Example Response After Linking

```
✅ Project linked to JIRA Epic!

📋 Epic: TT-206
🔗 URL: https://heygen-ai.atlassian.net/browse/TT-206
📁 Project: Localization System (localization_20250531_031122_709)

The project has been linked to the existing JIRA epic.
JIRA epic has been labeled with: project-localization_20250531_031122_709
```

**Then STOP. Don't plan tasks, don't analyze, don't suggest next steps.**

## Why This Matters

- Users want explicit control over when operations happen
- Linking is often just one step in a larger workflow
- Automatic task planning might conflict with existing plans
- Users need time to verify the link worked correctly

## Only Continue If Asked

Wait for explicit instructions like:
- "Now plan the tasks"
- "What should we do next?"
- "Create tasks for this project"

## Remember

**One operation at a time. Stop after each one. Wait for the user.** 