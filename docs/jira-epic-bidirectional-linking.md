# JIRA Epic Bidirectional Linking ✅

## Overview

The JIRA integration now implements true bidirectional linking between local projects and JIRA epics:
- **From Project → JIRA**: Project.json stores the epic information
- **From JIRA → Project**: JIRA epic is labeled with the project ID

## How It Works

### When You Link a Project to JIRA

Running:
```bash
project link_jira --projectId "localization_20250531_031122_709" --jiraProjectKey "TT-206"
```

Does TWO things:

#### 1. Updates Local Project
Saves to `data/projects/{projectId}/project.json`:
```json
{
  "externalTracker": {
    "type": "jira",
    "issueKey": "TT-206",
    "issueType": "epic",
    "url": "https://heygen-ai.atlassian.net/browse/TT-206"
  }
}
```

#### 2. Updates JIRA Epic
Adds a label to the JIRA epic:
- Label: `project-localization_20250531_031122_709`

## Benefits

### Finding Project from JIRA
In JIRA, you can now:
1. Look at the epic's labels
2. Find the label starting with `project-`
3. That's your local project ID!

### Finding JIRA from Project
When you open a project:
```bash
project open --projectId "localization_20250531_031122_709"
```

You'll see:
```
### External Tracker
- **Type**: JIRA
- **Issue**: TT-206 (epic)
- **URL**: https://heygen-ai.atlassian.net/browse/TT-206
```

## Searching in JIRA

To find all epics linked to MCP projects:
```
labels = "project-*"
```

To find a specific project's epic:
```
labels = "project-localization_20250531_031122_709"
```

## Error Handling

If the JIRA API call fails (e.g., no permissions, network issues):
- The local link is still created ✅
- A warning is logged
- You can manually add the label in JIRA later

## Implementation Details

The system uses:
1. **Local Storage**: Project.json for project → epic mapping
2. **JIRA Labels**: For epic → project mapping
3. **Label Format**: `project-{projectId}` for easy identification

This creates a robust bidirectional link that works even if one system is temporarily unavailable.

## Key Features

### 1. Automatic Project Key Extraction

When linking a project to JIRA, you can provide:
- A full JIRA issue key (e.g., `TT-206`)
- Just the project key (e.g., `TT`)
- A JIRA URL (future enhancement)

The system automatically extracts the project key from issue keys:
```bash
# All of these work:
project link_jira --projectId "localization_20250531_033045_123" --jiraProjectKey "TT"
project link_jira --projectId "localization_20250531_033045_123" --jiraProjectKey "TT-206"
```

### 2. JIRA Epic Tagging

When creating a JIRA epic, the system automatically:
- Adds the local project ID to the epic's labels (e.g., `project-localization_20250531_033045_123`)
- Includes the project ID in the epic's description
- Stores complete metadata for traceability

### 3. Local Project Metadata

The local project stores:
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

## Usage Examples

### Creating and Linking in One Step (Future)
```bash
# When you have an existing JIRA epic
project create --name "Translation System" --jiraEpicUrl "https://company.atlassian.net/browse/TRANS-100"
```

### Linking Existing Projects
```bash
# Using just the issue key
project link_jira --projectId "translation_20250531_033045_123" --jiraProjectKey "TRANS-100"

# The system extracts "TRANS" automatically
```

### Finding Projects from JIRA
In JIRA, search for:
- Label: `project-translation_20250531_033045_123`
- Or look in the epic description for the linked project ID

## Future Enhancements

1. **Continuous Mode**: Work through all tickets under the epic
2. **Ticket CRUD**: Create, update, and close JIRA tickets from the agent
3. **Status Sync**: Keep project and epic status in sync
4. **Bulk Operations**: Manage multiple tickets at once 