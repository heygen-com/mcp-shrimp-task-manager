# Tool Descriptions Update

## Overview

All unified tool descriptions have been updated to display available actions when hovering over them in the IDE.

## Changes Made

### Updated Tool Descriptions

Each unified tool now shows all available actions in its description:

1. **project**
   ```
   Actions: create (create new project), update (modify project), delete (remove project), list (show all projects), open (open project with context), generate_prompt (get project starter prompt), system_check (check system status), link_jira (link to JIRA epic), list_jira_projects (list JIRA projects)
   ```

2. **project_context**
   ```
   Actions: add (add new context), search (find contexts), analyze (patterns/problem_solution_pairs/decisions/knowledge_graph), timeline (view history), export (save to file), summary (get overview), delete (remove contexts)
   ```

3. **memories**
   ```
   Actions: record (save new memory), query (search memories), update (modify memory), delete (remove memory), maintenance (archive_old/decay_scores/get_stats), get_chain (get related memories), consolidate (merge duplicates), analytics (usage insights), export (save to file), import (load from file)
   ```

4. **browser**
   ```
   Actions: list_tabs (show all monitored browser tabs), check_logs (fetch browser logs for a tab, optional tabId parameter defaults to most recent)
   ```

5. **architecture_snapshot**
   ```
   Actions: create (analyze & document codebase), update (create new snapshot & compare), compare (diff two snapshots), list (show all snapshots). Options: depth, includeNodeModules, outputFormat
   ```

6. **jira**
   ```
   Actions: create (create tickets/epics), update (modify items), find (search items), list (show items), sync (sync with JIRA), verify_credentials (check auth). Domains: ticket, project, component, migration
   ```

## Benefits

- **Improved Discoverability**: Users can now see all available actions without referring to documentation
- **Better IDE Integration**: Hover tooltips now provide comprehensive information
- **Clearer API Surface**: Actions are explicitly listed with brief descriptions
- **Consistent Format**: All unified tools follow the same description pattern

## Usage

When hovering over a tool name in your IDE (e.g., VSCode, Cursor), you'll now see:
1. The tool's main purpose
2. All available actions with brief descriptions
3. Any special parameters or options
4. A reminder to use the action parameter

This makes it much easier to understand what each tool can do without leaving your editor. 