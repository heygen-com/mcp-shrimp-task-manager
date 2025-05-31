# JIRA Epic Linking - Simple Guide for Agents

## ⚠️ IMPORTANT: This is a ONE COMMAND operation!

When a user provides a JIRA epic URL (like `https://heygen-ai.atlassian.net/browse/TT-206`), you only need ONE command to link it to a project.

## ✅ CORRECT Approach (One Command)

```bash
project link_jira --projectId "localization_20250531_031122_709" --jiraProjectKey "TT-206"
```

That's it! The `link_jira` action will:
1. Extract the project key ("TT" from "TT-206")
2. Update the project.json with the epic info
3. Add the project ID as a label in JIRA

## ❌ WRONG Approaches (Don't Do These!)

### Don't use project update:
```bash
# WRONG - This won't work properly
project update --projectId "xyz" --updates {...}
```

### Don't use the jira tool:
```bash
# WRONG - This is for creating new tickets, not linking
jira create --domain ticket --context {...}
```

### Don't overthink it:
- No need to fetch epic details first
- No need to verify the epic exists
- No need to create anything new
- Just use `link_jira`!

## Examples

### User says: "Link this to TT-206"
```bash
project link_jira --projectId "current_project_id" --jiraProjectKey "TT-206"
```

### User provides full URL: "https://company.atlassian.net/browse/PROJ-123"
```bash
project link_jira --projectId "current_project_id" --jiraProjectKey "PROJ-123"
```

### User says: "Link to epic in project ABC"
```bash
project link_jira --projectId "current_project_id" --jiraProjectKey "ABC"
```

## Remember
- **ONE COMMAND**: `project link_jira`
- **TWO PARAMETERS**: `projectId` and `jiraProjectKey`
- **NOTHING ELSE**: Don't call other tools or overthink it 