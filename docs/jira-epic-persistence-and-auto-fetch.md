# JIRA Epic Persistence and Auto-Fetch Feature

## Current Status ✅

The JIRA epic information **IS** properly persisted to the `project.json` file. Here's what happens:

### 1. When You Link a Project to JIRA

When you run:
```bash
project link_jira --projectId "your_project_id" --jiraProjectKey "TT"
```

The following is saved to `data/projects/{projectId}/project.json`:
```json
{
  "externalTracker": {
    "type": "jira",
    "issueKey": "TT-206",
    "issueType": "epic",
    "url": "https://company.atlassian.net/browse/TT-206"
  }
}
```

### 2. When You Open the Project

When you run:
```bash
project open --projectId "your_project_id"
```

The JIRA information is displayed in the project summary:
```markdown
### External Tracker
- **Type**: JIRA
- **Issue**: TT-206 (epic)
- **URL**: https://company.atlassian.net/browse/TT-206
```

## Proposed Enhancement: Auto-Fetch JIRA Tasks

Since the JIRA epic information is already persisted, we can enhance the `project open` action to automatically fetch tasks from JIRA. Here's the proposed implementation:

### When Opening a Project with JIRA Integration

1. **Check for JIRA Epic**: If `externalTracker.type === 'jira'` and `issueType === 'epic'`
2. **Auto-fetch Child Issues**: Query JIRA for all issues under this epic
3. **Display Task Summary**: Show a summary of JIRA tasks in the project prompt
4. **Optional Sync**: Offer to sync JIRA tasks with local project tasks

### Example Enhanced Output

```markdown
## Project: Translation System
...

### External Tracker
- **Type**: JIRA
- **Issue**: TRANS-100 (epic)
- **URL**: https://company.atlassian.net/browse/TRANS-100

### JIRA Tasks (Auto-fetched)
**Epic: TRANS-100 - Translation System Implementation**

#### In Progress (3)
- TRANS-101: Implement i18n framework
- TRANS-102: Create translation memory system
- TRANS-103: Setup CI/CD for translations

#### To Do (5)
- TRANS-104: Add support for ICU message format
- TRANS-105: Create translation dashboard
- TRANS-106: Implement quality checks
- TRANS-107: Add glossary management
- TRANS-108: Setup automated testing

#### Done (2)
- TRANS-109: ✅ Research translation tools
- TRANS-110: ✅ Define project architecture

*Last synced: 2025-05-31 10:30:00*

💡 Run `jira sync --projectId "translation_20250531_120000"` to update tasks
```

## Implementation Plan

### 1. Update `generateProjectStarterPrompt` in `projectModel.ts`

```typescript
// Add after External Tracker section
if (project.externalTracker?.type === 'jira' && project.externalTracker.issueType === 'epic') {
  try {
    const epicTasks = await fetchJiraEpicTasks(project.externalTracker.issueKey);
    prompt += generateJiraTasksSummary(epicTasks);
  } catch (error) {
    prompt += `\n*Unable to fetch JIRA tasks: ${error.message}*\n`;
  }
}
```

### 2. Add New JIRA Functions

```typescript
// In jiraTools.ts
export async function fetchJiraEpicTasks(epicKey: string) {
  const jql = `parent = ${epicKey} OR "Epic Link" = ${epicKey}`;
  // Fetch and return tasks
}
```

### 3. Add Configuration Options

Allow users to control auto-fetching:
```bash
# Enable/disable auto-fetch
project config --autoFetchJira true

# Set fetch frequency
project config --jiraFetchInterval "on_open" # or "hourly", "daily"
```

## Benefits

1. **Instant Context**: See all JIRA tasks immediately when opening a project
2. **Stay Synchronized**: Know the current state of work without switching to JIRA
3. **Continuous Mode Ready**: Foundation for working through tickets automatically
4. **Offline Access**: Cached task data available even without internet

## Next Steps

To implement this feature:

1. Add `fetchJiraEpicTasks` function to `jiraTools.ts`
2. Modify `generateProjectStarterPrompt` to include JIRA tasks
3. Add caching mechanism to avoid excessive API calls
4. Create sync command for manual updates 