import * as fs from 'fs/promises';
import * as path from 'path';

// Determine the data directory, prioritizing DATA_DIR env var
const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const STATE_FILE_PATH = path.join(dataDir, 'global_agent_state.json');

export interface ToolUsageStats {
  last_used: string | null;
  total_count: number;
}

export interface GlobalAgentState {
  [toolKey: string]: ToolUsageStats;
}

// Define parameters for constructing tool keys and recording usage
export interface ToolCallParams {
  action?: string;
  domain?: string;
  status?: string;
  updateMode?: string;
  isId?: boolean;
  stage?: string;
  analysisType?: string;
  operation?: string;
  checkpointState?: string; // For checkpoint's 'state' parameter
  // Add other specific distinguishing parameters as new variants emerge
}

function normalizeBaseToolName(rawToolName: string): string {
  let normalized = rawToolName;
  if (normalized.startsWith('default_api.')) {
    normalized = normalized.substring('default_api.'.length);
  } else if (normalized.startsWith('mcp_mcp-shrimp-task-manager_')) {
    normalized = normalized.substring('mcp_mcp-shrimp-task-manager_'.length);
  }

  normalized = normalized
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  return normalized;
}

export function constructToolKey(
  rawToolName: string,
  params?: ToolCallParams
): string {
  const baseToolName = normalizeBaseToolName(rawToolName);
  let toolKey = baseToolName;
  const p = params || {};

  switch (baseToolName) {
    case 'jira':
      if (p.domain && p.action) toolKey = `${baseToolName}_${normalizeBaseToolName(p.domain)}_${normalizeBaseToolName(p.action)}`;
      break;
    case 'project':
    case 'pull_request':
    case 'architecture_snapshot':
    case 'browser':
      if (p.action) toolKey = `${baseToolName}_${normalizeBaseToolName(p.action)}`;
      break;
    case 'checkpoint':
      if (p.checkpointState) toolKey = `${baseToolName}_${normalizeBaseToolName(p.checkpointState)}`;
      break;
    case 'project_context':
      if (p.action) {
        if (p.action.toLowerCase() === 'analyze' && p.analysisType) {
          toolKey = `${baseToolName}_${normalizeBaseToolName(p.action)}_${normalizeBaseToolName(p.analysisType)}`;
        } else {
          toolKey = `${baseToolName}_${normalizeBaseToolName(p.action)}`;
        }
      }
      break;
    case 'memories':
      if (p.action) {
        if (p.action.toLowerCase() === 'maintenance' && p.operation) {
          toolKey = `${baseToolName}_${normalizeBaseToolName(p.action)}_${normalizeBaseToolName(p.operation)}`;
        } else {
          toolKey = `${baseToolName}_${normalizeBaseToolName(p.action)}`;
        }
      }
      break;
    case 'list_tasks':
    case 'report_task_result':
      if (p.status) toolKey = `${baseToolName}_${normalizeBaseToolName(p.status)}`;
      break;
    case 'split_tasks':
      if (p.updateMode) toolKey = `${baseToolName}_${normalizeBaseToolName(p.updateMode)}`;
      break;
    case 'query_task':
      if (p.isId !== undefined) toolKey = `${baseToolName}_${p.isId ? 'by_id' : 'by_keyword'}`;
      break;
    case 'process_thought':
      if (p.stage) toolKey = `${baseToolName}_${normalizeBaseToolName(p.stage.replace(/\\s+/g, '_'))}`;
      break;
  }
  return toolKey.replace(/__+/g, '_').replace(/^_|_$/g, ''); // Final cleanup
}

function getInitialState(): GlobalAgentState {
  const toolKeys: string[] = [
    'codebase_search', 'read_file', 'run_terminal_cmd', 'list_dir', 'grep_search', 'edit_file',
    'file_search', 'delete_file', 'reapply', 'web_search', 'plan_task', 'analyze_task',
    'reflect_task', 'split_tasks_append', 'split_tasks_overwrite', 'split_tasks_selective',
    'split_tasks_clear_all_tasks', 'list_tasks_all', 'list_tasks_pending',
    'list_tasks_in_progress', 'list_tasks_completed', 'execute_task', 'verify_task',
    'report_task_result_succeeded', 'report_task_result_failed', 'complete_task',
    'delete_task', /* task manager's delete */ 'clear_all_tasks', 'update_task',
    'query_task_by_keyword', 'query_task_by_id', 'get_task_detail',
    'process_thought_problem_definition', 'process_thought_collecting_information',
    'process_thought_research', 'process_thought_analysis', 'process_thought_synthesis',
    'process_thought_conclusion', 'process_thought_questioning', 'process_thought_planning',
    'init_project_rules', 'project_create', 'project_update', 'project_delete', 'project_list',
    'project_open', 'project_generate_prompt', 'project_system_check', 'project_link_jira',
    'project_list_jira_projects', 'project_rename', 'project_add_file', 'project_remove_file', 'project_help',
    'project_context_add', 'project_context_search', 'project_context_analyze_patterns',
    'project_context_analyze_problem_solution_pairs', 'project_context_analyze_decisions',
    'project_context_analyze_knowledge_graph', 'project_context_timeline',
    'project_context_export', 'project_context_summary', 'project_context_delete',
    'memories_record', 'memories_query', 'memories_update', 'memories_delete',
    'memories_maintenance_archive_old', 'memories_maintenance_decay_scores',
    'memories_maintenance_get_stats', 'memories_get_chain', 'memories_consolidate',
    'memories_analytics', 'memories_export', 'memories_import', 'log_data_dir',
    'consult_expert', 'check_agent_status', 'browser_list_tabs', 'browser_check_logs',
    'checkpoint_request_context', 'checkpoint_suggest_plan', 'checkpoint_consult_expert',
    'checkpoint_execute_plan', 'pull_request_review', 'pull_request_fix',
    'pull_request_rebuild', 'check_env', 'architecture_snapshot_create',
    'architecture_snapshot_update', 'architecture_snapshot_compare', 'architecture_snapshot_list',
    'jira_ticket_create', 'jira_ticket_update', 'jira_ticket_find', 'jira_ticket_list',
    'jira_ticket_sync', 'jira_ticket_verify_credentials',
    'jira_ticket_read', 'jira_ticket_history', 'jira_ticket_get_comment_tasks', 
    'jira_ticket_update_comment_task', 'jira_ticket_delete',
    'jira_project_create', 'jira_project_update', 'jira_project_find', 'jira_project_list',
    'jira_project_sync', 'jira_project_verify_credentials',
    'jira_component_create', 'jira_component_update', 'jira_component_find', 'jira_component_list',
    'jira_component_sync', 'jira_component_verify_credentials',
    'jira_migration_create', 'jira_migration_update', 'jira_migration_find', 'jira_migration_list',
    'jira_migration_sync', 'jira_migration_verify_credentials',
    'jira_user_find_user',
    'jira_ticket_create_comment', 'jira_ticket_read_comments', 'jira_ticket_update_comment', 
    'jira_ticket_delete_comment', 'jira_ticket_list_comments',
    'research_mode'
  ];
  const initialState: GlobalAgentState = {};
  for (const key of toolKeys) {
    initialState[key] = { last_used: null, total_count: 0 };
  }
  return initialState;
}

async function initializeStateFile(): Promise<GlobalAgentState> {
  const initialState = getInitialState();
  try {
    // Ensure the directory exists before writing
    await fs.mkdir(path.dirname(STATE_FILE_PATH), { recursive: true });
    await fs.writeFile(STATE_FILE_PATH, JSON.stringify(initialState, null, 2), 'utf-8');
    console.log(`Initialized state file at: ${STATE_FILE_PATH}`);
    return initialState;
  } catch (error) {
    console.error(`Failed to initialize state file at ${STATE_FILE_PATH}:`, error);
    throw error;
  }
}

async function readState(): Promise<GlobalAgentState> {
  try {
    await fs.access(STATE_FILE_PATH);
  } catch (error) {
    console.log(`State file not found at ${STATE_FILE_PATH} (details: ${error}), initializing...`);
    return initializeStateFile();
  }

  try {
    const data = await fs.readFile(STATE_FILE_PATH, 'utf-8');
    if (data.trim() === '') {
      console.log(`State file at ${STATE_FILE_PATH} is empty, re-initializing...`);
      return initializeStateFile();
    }
    return JSON.parse(data) as GlobalAgentState;
  } catch (error) {
    console.error(`Failed to read or parse state file at ${STATE_FILE_PATH}, re-initializing:`, error);
    return initializeStateFile(); // Consider backup/restore for production
  }
}

async function writeState(state: GlobalAgentState): Promise<void> {
  try {
    // Ensure the directory exists before writing
    await fs.mkdir(path.dirname(STATE_FILE_PATH), { recursive: true });
    await fs.writeFile(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to write state file at ${STATE_FILE_PATH}:`, error);
    // Handle error appropriately in a production environment
  }
}

export async function recordToolUsage(
  rawToolName: string,
  params?: ToolCallParams
): Promise<void> {
  const toolKey = constructToolKey(rawToolName, params);
  const state = await readState();

  if (!state[toolKey]) {
    // This case should ideally be handled by pre-populating all known keys
    // or dynamically adding new keys if that's desired (requires modification to initializeStateFile or getInitialState logic)
    console.warn(`Tool key "${toolKey}" not found in state. Initializing dynamically. Raw: ${rawToolName}, Params: ${JSON.stringify(params)}`);
    state[toolKey] = { last_used: null, total_count: 0 };
  }

  state[toolKey].last_used = new Date().toISOString();
  state[toolKey].total_count += 1;

  await writeState(state);
  // console.log(`Recorded usage for tool: ${toolKey}`);
}

// Optional: Function to get the full state if needed elsewhere
export async function getFullToolUsageState(): Promise<GlobalAgentState> {
    return readState();
}

// Optional: Initialize state file on module load if it doesn't exist.
// This ensures that the file is ready when the first tool call is made.
// (async () => {
//   await readState(); // This will call initializeStateFile if needed
// })(); 