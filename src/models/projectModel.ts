import {
  Project,
  ProjectContext,
  ProjectInsight,
  ProjectStatus,
  ProjectReport,
  ProjectContextType,
  ProjectPriority,
  ProjectCategory,
  ExternalTracker,
  ProjectMetadata,
} from "../types/index.js";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import { getAllTasks, createTask, updateTask } from "./taskModel.js";
import { Task, TaskStatus } from "../types/index.js";
import { generateProjectId, ensureUniqueProjectId, generateContextId, generateInsightId } from "../utils/idGenerator.js";

// Get project root path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Data directory paths
const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, "data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");

// Log the data directory being used (only in debug mode)
if (process.env.MCP_DEBUG_LOGGING === "true") {
  console.error(`[DEBUG] Using DATA_DIR: ${DATA_DIR}`);
  console.error(`[DEBUG] Using PROJECTS_DIR: ${PROJECTS_DIR}`);
}

// Ensure projects directory exists
async function ensureProjectsDir() {
  try {
    await fs.access(PROJECTS_DIR);
  } catch {
    // intentionally empty: directory will be created if not found
  }
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
}

// Get project directory path
function getProjectDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId);
}

// Get project file paths
function getProjectPaths(projectId: string) {
  const projectDir = getProjectDir(projectId);
  return {
    projectDir,
    metadataFile: path.join(projectDir, "project.json"),
    contextDir: path.join(projectDir, "context"),
    tasksDir: path.join(projectDir, "tasks"),
    reportsDir: path.join(projectDir, "reports"),
  };
}

// Read project metadata
async function readProjectMetadata(projectId: string): Promise<Project | null> {
  try {
    const { metadataFile } = getProjectPaths(projectId);
    const data = await fs.readFile(metadataFile, "utf-8");
    const project = JSON.parse(data);
    
    // Convert date strings back to Date objects
    return {
      ...project,
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt),
    };
  } catch {
    return null;
  }
}

// Write project metadata
async function writeProjectMetadata(project: Project): Promise<void> {
  const { metadataFile } = getProjectPaths(project.id);
  await fs.writeFile(metadataFile, JSON.stringify(project, null, 2));
}

// Project folders are now named using a semantic, slugified version of the project name, e.g. 'translation_project_xxxxx'.
// This makes project folders and files human-readable and searchable.
// When opening a project, if not found by ID or name, a semantic search fallback is used.

// Create a new project
export async function createProject(
  name: string,
  description: string,
  goals?: string[],
  tags?: string[],
  priority?: ProjectPriority,
  category?: ProjectCategory,
  externalTracker?: ExternalTracker,
  metadata?: ProjectMetadata
): Promise<Project> {
  await ensureProjectsDir();
  
  // Generate human-readable, semantic project ID (folder name)
  const baseId = generateProjectId(name); // Pass name for semantic slug
  const existingProjects = await getAllProjects();
  const existingIds = existingProjects.map(p => p.id);
  const projectId = await ensureUniqueProjectId(baseId, existingIds);
  
  const paths = getProjectPaths(projectId);
  
  // Create project directories
  await fs.mkdir(paths.projectDir, { recursive: true });
  await fs.mkdir(paths.contextDir, { recursive: true });
  await fs.mkdir(paths.tasksDir, { recursive: true });
  await fs.mkdir(paths.reportsDir, { recursive: true });
  
  const newProject: Project = {
    id: projectId,
    name,
    description,
    status: ProjectStatus.ACTIVE,
    goals: goals || [],
    tags: tags || [],
    createdAt: new Date(),
    updatedAt: new Date(),
    taskIds: [],
    contextIds: [],
    insightIds: [],
    priority,
    category,
    externalTracker,
    metadata,
  };
  
  await writeProjectMetadata(newProject);
  
  return newProject;
}

// Get all projects
export async function getAllProjects(): Promise<Project[]> {
  await ensureProjectsDir();
  
  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);
    const projects: Project[] = [];
    
    for (const dir of projectDirs) {
      const project = await readProjectMetadata(dir);
      if (project) {
        projects.push(project);
      }
    }
    
    return projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } catch {
    return [];
  }
}

// Get project by ID
export async function getProjectById(projectId: string): Promise<Project | null> {
  return await readProjectMetadata(projectId);
}

// Update project
export async function updateProject(
  projectId: string,
  updates: Partial<Project>
): Promise<Project | null> {
  const project = await readProjectMetadata(projectId);
  
  if (!project) {
    return null;
  }
  
  const updatedProject = {
    ...project,
    ...updates,
    id: project.id, // Ensure ID cannot be changed
    createdAt: project.createdAt, // Ensure creation date cannot be changed
    updatedAt: new Date(),
  };
  
  await writeProjectMetadata(updatedProject);
  
  return updatedProject;
}

// Delete project
export async function deleteProject(projectId: string): Promise<boolean> {
  try {
    const paths = getProjectPaths(projectId);
    await fs.rm(paths.projectDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// Check if similar context already exists
async function contextExists(
  projectId: string,
  content: string,
  type: ProjectContextType
): Promise<boolean> {
  const contexts = await getProjectContexts(projectId);
  
  // Check for exact matches or very similar content
  return contexts.some(ctx => {
    // Exact match
    if (ctx.content === content && ctx.type === type) {
      return true;
    }
    
    // Similar content (first 100 chars match and same type)
    if (ctx.type === type && 
        content.length > 100 && 
        ctx.content.substring(0, 100) === content.substring(0, 100)) {
      return true;
    }
    
    return false;
  });
}

// Add context to project
export async function addProjectContext(
  projectId: string,
  context: Omit<ProjectContext, "id" | "createdAt">
): Promise<ProjectContext | null> {
  const project = await readProjectMetadata(projectId);
  
  if (!project) {
    return null;
  }
  
  // Check for duplicates
  const isDuplicate = await contextExists(projectId, context.content, context.type);
  if (isDuplicate) {
    throw new Error("Similar context already exists for this project");
  }
  
  // Generate human-readable context ID
  const contextId = generateContextId();
  const newContext: ProjectContext = {
    id: contextId,
    ...context,
    createdAt: new Date(),
  };
  
  // Save context file
  const { contextDir } = getProjectPaths(projectId);
  const contextFile = path.join(contextDir, `${contextId}.json`);
  await fs.writeFile(contextFile, JSON.stringify(newContext, null, 2));
  
  // Update project metadata
  project.contextIds.push(contextId);
  await updateProject(projectId, { contextIds: project.contextIds });
  
  return newContext;
}

// Get project contexts
export async function getProjectContexts(projectId: string): Promise<ProjectContext[]> {
  const project = await readProjectMetadata(projectId);
  if (!project) {
    return [];
  }
  const { contextDir } = getProjectPaths(projectId);
  const contexts: ProjectContext[] = [];
  for (const contextId of project.contextIds) {
    try {
      const contextFile = path.join(contextDir, `${contextId}.json`);
      const data = await fs.readFile(contextFile, "utf-8");
      const context = JSON.parse(data);
      contexts.push({
        ...context,
        createdAt: new Date(context.createdAt),
      });
    } catch {
      // Skip if context file not found
    }
  }
  return contexts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Add insight to project (for ah-ha moments and breakthroughs)
export async function addProjectInsight(
  projectId: string,
  insight: Omit<ProjectInsight, "id" | "createdAt">
): Promise<ProjectInsight | null> {
  const project = await readProjectMetadata(projectId);
  
  if (!project) {
    return null;
  }
  
  // Generate human-readable insight ID
  const insightId = generateInsightId();
  const newInsight: ProjectInsight = {
    id: insightId,
    ...insight,
    createdAt: new Date(),
  };
  
  // Save insight as a special type of context
  const { contextDir } = getProjectPaths(projectId);
  const insightFile = path.join(contextDir, `${insightId}.json`);
  await fs.writeFile(insightFile, JSON.stringify(newInsight, null, 2));
  
  // Update project metadata
  project.insightIds.push(insightId);
  await updateProject(projectId, { insightIds: project.insightIds });
  
  return newInsight;
}

// Get project insights
export async function getProjectInsights(projectId: string): Promise<ProjectInsight[]> {
  const project = await readProjectMetadata(projectId);
  if (!project) {
    return [];
  }
  const { contextDir } = getProjectPaths(projectId);
  const insights: ProjectInsight[] = [];
  for (const insightId of project.insightIds) {
    try {
      // Try new naming convention first
      const insightFile = path.join(contextDir, `${insightId}.json`);
      const data = await fs.readFile(insightFile, "utf-8");
      const insight = JSON.parse(data);
      insights.push({
        ...insight,
        createdAt: new Date(insight.createdAt),
      });
    } catch {
      // Try old naming convention as fallback
      try {
        const oldInsightFile = path.join(contextDir, `insight_${insightId}.json`);
        const data = await fs.readFile(oldInsightFile, "utf-8");
        const insight = JSON.parse(data);
        insights.push({
          ...insight,
          createdAt: new Date(insight.createdAt),
        });
      } catch {
        // Skip if insight file not found in either format
      }
    }
  }
  return insights.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Create project task
export async function createProjectTask(
  projectId: string,
  taskData: {
    name: string;
    description: string;
    notes?: string;
    dependencies?: string[];
  }
): Promise<Task | null> {
  const project = await readProjectMetadata(projectId);
  
  if (!project) {
    return null;
  }
  
  // Create task with project reference
  const task = await createTask(
    taskData.name,
    taskData.description,
    taskData.notes,
    taskData.dependencies
  );
  
  // Update task with project reference
  await updateTask(task.id, { projectId });
  
  // Update project with task reference
  project.taskIds.push(task.id);
  await updateProject(projectId, { taskIds: project.taskIds });
  
  return task;
}

// Get project tasks
export async function getProjectTasks(projectId: string): Promise<Task[]> {
  const project = await readProjectMetadata(projectId);
  
  if (!project) {
    return [];
  }
  
  const allTasks = await getAllTasks();
  return allTasks.filter(task => project.taskIds.includes(task.id));
}

// Generate project report
export async function generateProjectReport(
  projectId: string,
  reportType: "summary" | "progress" | "insights" | "full"
): Promise<ProjectReport | null> {
  const project = await readProjectMetadata(projectId);
  
  if (!project) {
    return null;
  }
  
  const tasks = await getProjectTasks(projectId);
  const contexts = await getProjectContexts(projectId);
  const insights = await getProjectInsights(projectId);
  
  const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED);
  const pendingTasks = tasks.filter(t => t.status === TaskStatus.PENDING);
  const inProgressTasks = tasks.filter(t => t.status === TaskStatus.IN_PROGRESS);
  
  const report: ProjectReport = {
    id: uuidv4(),
    projectId,
    type: reportType,
    generatedAt: new Date(),
    summary: {
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      pendingTasks: pendingTasks.length,
      inProgressTasks: inProgressTasks.length,
      completionRate: tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0,
      totalContexts: contexts.length,
      totalInsights: insights.length,
    },
    content: {},
  };
  
  // Add content based on report type
  if (reportType === "summary" || reportType === "full") {
    report.content.projectOverview = {
      name: project.name,
      description: project.description,
      status: project.status,
      goals: project.goals,
      tags: project.tags,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
  
  if (reportType === "progress" || reportType === "full") {
    report.content.taskProgress = {
      completed: completedTasks.map(t => ({ id: t.id, name: t.name, completedAt: t.completedAt })),
      inProgress: inProgressTasks.map(t => ({ id: t.id, name: t.name, updatedAt: t.updatedAt })),
      pending: pendingTasks.map(t => ({ id: t.id, name: t.name, dependencies: t.dependencies })),
    };
  }
  
  if (reportType === "insights" || reportType === "full") {
    report.content.insights = insights.map(i => ({
      id: i.id,
      title: i.title,
      description: i.description,
      impact: i.impact,
      tags: i.tags,
      createdAt: i.createdAt,
    }));
    
    report.content.recentContexts = contexts.slice(0, 10).map(c => ({
      id: c.id,
      type: c.type,
      content: c.content.substring(0, 200) + (c.content.length > 200 ? "..." : ""),
      tags: c.tags,
      createdAt: c.createdAt,
    }));
  }
  
  // Save report
  const { reportsDir } = getProjectPaths(projectId);
  const reportFile = path.join(reportsDir, `${report.id}_${reportType}.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  
  return report;
}

// Generate starter prompt from project
export async function generateProjectStarterPrompt(projectId: string): Promise<string | null> {
  const project = await readProjectMetadata(projectId);
  
  if (!project) {
    return null;
  }
  
  const contexts = await getProjectContexts(projectId);
  const insights = await getProjectInsights(projectId);
  const tasks = await getProjectTasks(projectId);
  
  // Read project files
  const { fileContents, missingFiles, errors } = await readProjectFiles(projectId);
  
  let prompt = `# Project: ${project.name}\n\n`;
  prompt += `## Description\n${project.description}\n\n`;
  
  if (project.goals && project.goals.length > 0) {
    prompt += `## Goals\n`;
    project.goals.forEach((goal: string) => {
      prompt += `- ${goal}\n`;
    });
    prompt += `\n`;
  }
  
  // Key Insights, Code Changes, Important Context, Referenced Files, Current Tasks (Order remains)
  if (insights && insights.length > 0) {
    prompt += `## Key Insights\n`;
    insights.slice(0, 5).forEach(insight => {
      prompt += `### ${insight.title} (${insight.impact} impact)\n`;
      prompt += `${insight.description}\n\n`;
    });
  }
  const codeChanges = contexts.filter(c => c.tags?.includes("code-change"));
  if (codeChanges.length > 0) {
    prompt += `## Code Changes\n`;
    codeChanges.forEach(change => {
      prompt += `### ${change.content.split('\n')[0]}\n`;
      prompt += `${change.content}\n\n`;
    });
  }
  if (contexts.length > 0) {
    prompt += `## Important Context\n`;
    const importantContexts = contexts.filter(c => 
      c.tags?.includes("important") || 
      (!c.tags?.includes("code-change") && c.type !== "reference")
    ).slice(0, 5);
    importantContexts.forEach(context => {
      const preview = context.content.length > 200 
        ? context.content.substring(0, 200) + "..."
        : context.content;
      prompt += `- **${context.type}**: ${preview}\n`;
    });
    prompt += `\n`;
  }
  const fileReferences = contexts.filter(c => c.tags?.includes("file-reference"));
  if (fileReferences.length > 0) {
    prompt += `## Referenced Files\n`;
    fileReferences.forEach(ref => {
      const lines = ref.content.split('\n');
      prompt += `- ${lines[0]}\n`;
      if (lines[1]) prompt += `  ${lines[1]}\n`;
    });
    prompt += `\n`;
  }
  const incompleteTasks = tasks.filter(t => t.status !== TaskStatus.COMPLETED);
  if (incompleteTasks.length > 0) {
    prompt += `## Current Tasks\n`;
    incompleteTasks.slice(0, 10).forEach(task => {
      prompt += `- [ ] **${task.name}**: ${task.description}\n`;
      if (task.notes) {
        prompt += `  Notes: ${task.notes.substring(0, 100)}${task.notes.length > 100 ? '...' : ''}\n`;
      }
    });
    prompt += `\n`;
  }
  
  // Project Metadata and Details
  prompt += `## Project Metadata\n`;
  prompt += `- **Status**: ${project.status}\n`;
  if (project.priority) {
    prompt += `- **Priority**: ${project.priority}\n`;
  }
  if (project.category) {
    prompt += `- **Category**: ${project.category}\n`;
  }
  prompt += `- **Created**: ${project.createdAt.toISOString()}\n`;
  prompt += `- **Last Updated**: ${project.updatedAt.toISOString()}\n`;
  prompt += `- **Total Contexts**: ${contexts.length}\n`;
  prompt += `- **Total Insights**: ${insights.length}\n`;
  prompt += `- **Total Tasks**: ${tasks.length}\n`;
  if (project.files && project.files.length > 0) {
    prompt += `- **Project Files**: ${project.files.length} files (${fileContents.length} readable)\n`;
  }
  if (project.tags && project.tags.length > 0) {
    prompt += `- **Tags**: ${project.tags.join(", ")}\n`;
  }
  if (project.externalTracker) {
    prompt += `\n### External Tracker\n`;
    prompt += `- **Type**: ${project.externalTracker.type.toUpperCase()}\n`;
    prompt += `- **Issue**: ${project.externalTracker.issueKey}`;
    if (project.externalTracker.issueType) {
      prompt += ` (${project.externalTracker.issueType})`;
    }
    prompt += `\n`;
    if (project.externalTracker.url) {
      prompt += `- **URL**: ${project.externalTracker.url}\n`;
    }
  }
  if (project.metadata) {
    prompt += `\n### Project Details\n`;
    if (project.metadata.owner) {
      prompt += `- **Owner**: ${project.metadata.owner}\n`;
    }
    if (project.metadata.team) {
      prompt += `- **Team**: ${project.metadata.team}\n`;
    }
    if (project.metadata.deadline) {
      const deadline = new Date(project.metadata.deadline);
      const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      prompt += `- **Deadline**: ${deadline.toLocaleDateString()} (${daysLeft} days ${daysLeft > 0 ? 'remaining' : 'overdue'})\n`;
    }
    if (project.metadata.repository) {
      prompt += `- **Repository**: ${project.metadata.repository}\n`;
    }
    if (project.metadata.estimatedHours) {
      prompt += `- **Estimated Hours**: ${project.metadata.estimatedHours}\n`;
    }
    if (project.metadata.actualHours) {
      prompt += `- **Actual Hours**: ${project.metadata.actualHours}\n`;
    }
  }
  prompt += `\n`;
  
  // --- Appendix for Included Project Files (from project.files array) ---
  let projectFilesAppendix = "";
  if (fileContents.length > 0 || missingFiles.length > 0 || errors.length > 0) {
    projectFilesAppendix += "\n---\n## Appendix: Included Project Files\n";
  }

  if (fileContents.length > 0) {
    projectFilesAppendix += `\n### Successfully Loaded Files (${fileContents.length}):\n`;
    fileContents.forEach(file => {
      projectFilesAppendix += `\n#### ${file.path}\n`;
      projectFilesAppendix += `\`\`\`\n${file.content}\n\`\`\`\n`;
    });
  }
  
  if (missingFiles.length > 0 || errors.length > 0) {
    projectFilesAppendix += `\n### ⚠️ File Issues\n`;
    if (missingFiles.length > 0) {
      projectFilesAppendix += `\n**Missing Files (${missingFiles.length}):**\n`;
      missingFiles.forEach(file => {
        projectFilesAppendix += `- ❌ ${file}\n`;
      });
    }
    if (errors.length > 0) {
      projectFilesAppendix += `\n**File Read Errors (${errors.length}):**\n`;
      errors.forEach(error => {
        projectFilesAppendix += `- ⚠️ ${error.path}: ${error.error}\n`;
      });
    }
  }
  
  // Append the project files appendix at the very end
  if (projectFilesAppendix) {
    prompt += projectFilesAppendix;
  }
  
  // Save the prompt as a markdown file in the project directory
  const { projectDir } = getProjectPaths(projectId);
  const promptFile = path.join(projectDir, `starter-prompt-${new Date().toISOString().split('T')[0]}.md`);
  await fs.writeFile(promptFile, prompt);
  
  // Also save a copy as the latest prompt
  const latestPromptFile = path.join(projectDir, 'STARTER_PROMPT.md');
  await fs.writeFile(latestPromptFile, prompt);
  
  return prompt;
}

// Search projects
export async function searchProjects(
  query: string,
  searchIn: ("name" | "description" | "tags" | "goals")[] = ["name", "description"]
): Promise<Project[]> {
  const allProjects = await getAllProjects();
  const queryLower = query.toLowerCase();
  
  return allProjects.filter(project => {
    if (searchIn.includes("name") && project.name.toLowerCase().includes(queryLower)) {
      return true;
    }
    if (searchIn.includes("description") && project.description.toLowerCase().includes(queryLower)) {
      return true;
    }
    if (searchIn.includes("tags") && project.tags.some((tag: string) => tag.toLowerCase().includes(queryLower))) {
      return true;
    }
    if (searchIn.includes("goals") && project.goals.some((goal: string) => goal.toLowerCase().includes(queryLower))) {
      return true;
    }
    return false;
  });
}

// Fallback: find project by semantic match (name, tags, description)
export async function findProjectBySemanticMatch(query: string): Promise<Project | null | Project[]> {
  const matches = await searchProjects(query, ["name", "tags", "description"]);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return matches; // Let caller handle multiple
  return null;
}

// Helper to get path to active project file
function getActiveProjectFilePath() {
  return path.join(DATA_DIR, "active_project.json");
}

// Set active project
export async function setActiveProject(projectId: string, projectName: string) {
  const activeProject = {
    projectId,
    projectName,
    openedAt: new Date().toISOString(),
  };
  const filePath = getActiveProjectFilePath();
  await fs.writeFile(filePath, JSON.stringify(activeProject, null, 2));
}

// Get active project
export async function getActiveProject(): Promise<{ projectId: string, projectName: string, openedAt: string } | null> {
  const filePath = getActiveProjectFilePath();
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Logging helper for rename
const RENAME_LOG_PATH = "/tmp/mcp_project_rename_debug.log";
async function logRenameDebug(msg: string) {
  try {
    await fs.appendFile(RENAME_LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // Ignore logging errors
  }
}

/**
 * Rename a project, updating its folder, ID, and all references.
 * Throws if the new name is already taken.
 */
export async function renameProject(
  oldProjectId: string,
  newSemanticName: string
): Promise<Project> {
  await ensureProjectsDir();
  const oldProject = await readProjectMetadata(oldProjectId);
  if (!oldProject) throw new Error(`Project not found: ${oldProjectId}`);

  // Generate new projectId and check for collisions
  const baseId = generateProjectId(newSemanticName);
  const existingProjects = await getAllProjects();
  const existingIds = existingProjects.map(p => p.id).filter(id => id !== oldProjectId);
  const newProjectId = await ensureUniqueProjectId(baseId, existingIds);
  if (existingIds.includes(newProjectId)) {
    throw new Error(`Project name already in use: ${newSemanticName}`);
  }

  const oldPaths = getProjectPaths(oldProjectId);
  const newPaths = getProjectPaths(newProjectId);

  await logRenameDebug(`Attempting to rename project folder: ${oldPaths.projectDir} -> ${newPaths.projectDir}`);
  try {
    await fs.rename(oldPaths.projectDir, newPaths.projectDir);
    await logRenameDebug(`Successfully renamed folder to: ${newPaths.projectDir}`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logRenameDebug(`ERROR renaming folder: ${errorMsg}`);
    throw new Error(`Failed to rename project folder: ${errorMsg}`);
  }

  // Update project metadata
  const updatedProject: Project = {
    ...oldProject,
    id: newProjectId,
    name: newSemanticName,
    updatedAt: new Date(),
  };
  await writeProjectMetadata(updatedProject);

  // Update all context, insight, and task references if needed (IDs remain, but parent projectId changes)
  // (If file prefixes are needed, implement here)

  // Optionally, update any other references in the system (e.g., memory, reports)

  return updatedProject;
}

// Read project files and handle missing files
export async function readProjectFiles(projectId: string): Promise<{
  fileContents: Array<{ path: string; content: string; }>;
  missingFiles: string[];
  errors: Array<{ path: string; error: string; }>;
}> {
  const project = await readProjectMetadata(projectId);
  if (!project || !project.files || project.files.length === 0) {
    return { fileContents: [], missingFiles: [], errors: [] };
  }

  const fileContents: Array<{ path: string; content: string; }> = [];
  const missingFiles: string[] = [];
  const errors: Array<{ path: string; error: string; }> = [];

  for (const filePath of project.files) {
    try {
      // Ensure path is absolute
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
      
      // Check if file exists and is readable
      await fs.access(absolutePath, fs.constants.R_OK);
      
      // Read file content
      const content = await fs.readFile(absolutePath, 'utf-8');
      fileContents.push({ path: absolutePath, content });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
        missingFiles.push(filePath);
      } else {
        errors.push({ path: filePath, error: errorMessage });
      }
    }
  }

  return { fileContents, missingFiles, errors };
}

// Add file to project files array
export async function addProjectFile(projectId: string, filePath: string): Promise<boolean> {
  const project = await readProjectMetadata(projectId);
  if (!project) {
    return false;
  }

  // Convert to absolute path if relative
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  
  // Check if file exists
  try {
    await fs.access(absolutePath, fs.constants.R_OK);
  } catch {
    throw new Error(`File not found or not readable: ${absolutePath}`);
  }

  // Initialize files array if it doesn't exist
  if (!project.files) {
    project.files = [];
  }

  // Check if file is already in the list
  if (project.files.includes(absolutePath)) {
    return false; // Already exists
  }

  // Add file to project
  project.files.push(absolutePath);
  await updateProject(projectId, { files: project.files });
  
  return true;
}

// Remove file from project files array
export async function removeProjectFile(projectId: string, filePath: string): Promise<boolean> {
  const project = await readProjectMetadata(projectId);
  if (!project || !project.files) {
    return false;
  }

  // Convert to absolute path if relative for comparison
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  
  // Find and remove file from array
  const initialLength = project.files.length;
  project.files = project.files.filter(f => f !== absolutePath && f !== filePath);
  
  if (project.files.length === initialLength) {
    return false; // File not found in list
  }

  await updateProject(projectId, { files: project.files });
  return true;
}

// Normalize relative paths to absolute in project files
export async function normalizeProjectFilePaths(projectId: string): Promise<void> {
  const project = await readProjectMetadata(projectId);
  if (!project || !project.files || project.files.length === 0) {
    return;
  }

  let hasChanges = false;
  const normalizedFiles = project.files.map(filePath => {
    if (!path.isAbsolute(filePath)) {
      hasChanges = true;
      return path.resolve(filePath);
    }
    return filePath;
  });

  if (hasChanges) {
    await updateProject(projectId, { files: normalizedFiles });
  }
} 