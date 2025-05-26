# Context Deletion Guide

The `project_context` tool now includes a powerful delete action that allows you to remove incorrect or unwanted context entries from your project history.

## Overview

The delete action provides two ways to remove context:
1. **Delete by ID** - Remove a specific context entry by its unique ID
2. **Delete by Query** - Remove multiple contexts matching a search query

## Usage Examples

### Delete a Specific Context by ID

If you know the exact ID of the context you want to delete:

```
project_context action=delete projectId=<project-id> contextId=<context-id>
```

Example:
```
project_context action=delete projectId=proj_abc123 contextId=ctx_xyz789
```

### Delete Contexts by Query

To delete all contexts containing specific text:

```
project_context action=delete projectId=<project-id> deleteQuery="<search-text>"
```

Example - Delete all contexts mentioning "Redis":
```
project_context action=delete projectId=proj_abc123 deleteQuery="Redis"
```

### Confirming Multiple Deletions

When your query matches multiple contexts, the tool will show you a preview and require confirmation:

```
⚠️ Found 3 contexts to delete:

- **decision** (ctx_abc123): Decided to use Redis for caching...
- **solution** (ctx_def456): Implemented Redis connection pool...
- **problem** (ctx_ghi789): Redis memory usage is too high...

To confirm deletion, run again with confirmDelete: true
```

To confirm and delete all matching contexts:
```
project_context action=delete projectId=proj_abc123 deleteQuery="Redis" confirmDelete=true
```

## Finding Context IDs

To find the ID of a context you want to delete, you can:

1. **Search for contexts**:
   ```
   project_context action=search projectId=<project-id> query="<search-text>"
   ```

2. **View timeline**:
   ```
   project_context action=timeline projectId=<project-id>
   ```

3. **Export contexts**:
   ```
   project_context action=export projectId=<project-id> format=json
   ```

All of these will show context IDs alongside the content.

## Safety Features

1. **Preview Before Delete** - When using deleteQuery, you'll see what will be deleted before confirmation
2. **Deletion Report** - A detailed report is saved after deletion showing exactly what was removed
3. **No Accidental Mass Deletion** - Multiple deletions require explicit confirmation

## Common Use Cases

### Remove Incorrect Technical Decisions
```
project_context action=delete projectId=proj_abc123 deleteQuery="use MongoDB for storage" confirmDelete=true
```

### Clean Up Test Contexts
```
project_context action=delete projectId=proj_abc123 deleteQuery="test context" confirmDelete=true
```

### Remove Specific Context Entry
First find the ID:
```
project_context action=search projectId=proj_abc123 query="wrong approach"
```

Then delete it:
```
project_context action=delete projectId=proj_abc123 contextId=ctx_wrongid123
```

## What Gets Deleted

When you delete a context:
- The context entry is removed from the project's context list
- Any associated context files in the `contexts/` directory are deleted
- A deletion report is generated and saved

## Deletion Reports

After each deletion, a report is saved to:
```
<project-dir>/deletion-report-<date>.md
```

This report contains:
- List of all deleted contexts
- Their content (first 200 characters)
- Tags and metadata
- Summary of contexts deleted vs remaining

This allows you to review what was deleted and recover information if needed. 