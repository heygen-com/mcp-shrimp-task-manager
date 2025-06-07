# JIRA Comment Task Completion Notes

## Overview

When marking JIRA comment tasks as complete, agents can now include a **completion note** to document what was done. This helps maintain a clear record of task resolution directly within the JIRA comment.

## How It Works

When using the `update_comment_task` action with the JIRA tool, agents can include an optional `completionNote` parameter:

```json
{
  "action": "update_comment_task",
  "domain": "ticket",
  "context": {
    "issueKey": "TT-213",
    "taskId": "adf_27254_8c099b7a-ccaa-4a5d-aba0-76e7313aaf98",
    "completed": true,
    "completionNote": "Updated Spanish translation file with 'Descargar' for the video menu download action"
  }
}
```

## Visual Appearance

The completion note is added to the JIRA comment as a visually distinct panel:
- **Success Panel** (green) - When marking a task complete
- **Info Panel** (blue) - When reopening a task

The panel includes:
- Task reference (text or ID)
- What was done / reason for reopening
- Timestamp of the update

## Benefits

1. **Accountability** - Clear record of who completed what and when
2. **Knowledge Sharing** - Team members can see how tasks were resolved
3. **Audit Trail** - Historical record of task completions
4. **Context** - Future reference for similar tasks

## Agent Behavior

When agents mark tasks complete without a completion note, they'll see a reminder:

> 💡 **Tip:** Consider including a completionNote parameter to document what was done for this task.

This encourages best practices for documentation.

## Example Output

When a task is marked complete with a note:

```text
✅ Comment Task Successfully Updated

Issue: TT-213
Task ID: adf_27254_8c099b7a-ccaa-4a5d-aba0-76e7313aaf98
Status: Completed ✓
Comment: 27254
Method: Updated ADF taskItem via JIRA API

🎯 Task has been marked as complete in the JIRA comment.

📝 Completion Note Added: Updated Spanish translation file with 'Descargar' for the video menu download action
```

## Technical Details

- The completion note is appended to the comment's ADF (Atlassian Document Format) structure
- It appears as a panel element below the original comment content
- The original comment structure is preserved
- Works with both UUID format task IDs and `adf_` prefixed task IDs 

## JIRA Formatting Note (Wiki Markup)

**Important:** JIRA uses its own **Wiki Markup** for formatting text, not standard Markdown. If you use Markdown syntax (like `##` for headers or `**bold**`), it will appear as plain text in JIRA comments and descriptions.

For richly formatted comments, please use JIRA's syntax.

- For **bold** text, use `*bold text*`.
- For _italic_ text, use `_italic text_`.
- For lists, start a line with `*` (for bulleted) or `#` (for numbered).

For a complete guide, please see the [JIRA Text Formatting Notation Guide](https://jira.slac.stanford.edu/secure/WikiRendererHelpAction.jspa?section=all). 