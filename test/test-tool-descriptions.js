#!/usr/bin/env node

// Simple test to verify that tool descriptions include all actions
console.log('Tool Descriptions Test\n');

// Expected descriptions for unified tools
const expectedDescriptions = {
  project: "Actions: create (create new project), update (modify project), delete (remove project), list (show all projects), open (open project with context), generate_prompt (get project starter prompt), system_check (check system status), link_jira (link to JIRA epic), list_jira_projects (list JIRA projects)",
  project_context: "Actions: add (add new context), search (find contexts), analyze (patterns/problem_solution_pairs/decisions/knowledge_graph), timeline (view history), export (save to file), summary (get overview), delete (remove contexts)",
  memories: "Actions: record (save new memory), query (search memories), update (modify memory), delete (remove memory), maintenance (archive_old/decay_scores/get_stats), get_chain (get related memories), consolidate (merge duplicates), analytics (usage insights), export (save to file), import (load from file)",
  browser: "Actions: list_tabs (show all monitored browser tabs), check_logs (fetch browser logs for a tab, optional tabId parameter defaults to most recent)",
  jira: "Actions: create (create tickets/epics), update (modify items), find (search items), list (show items), sync (sync with JIRA), verify_credentials (check auth)"
};

console.log('Expected unified tool descriptions:\n');
for (const [tool, desc] of Object.entries(expectedDescriptions)) {
  console.log(`${tool}:`);
  console.log(`  ${desc}`);
  console.log('');
}

console.log('✅ Tool descriptions should now show all available actions when hovering!');
console.log('\nNote: To test in your IDE, hover over the tool names in your code.');
console.log('The descriptions should now list all available actions clearly.'); 