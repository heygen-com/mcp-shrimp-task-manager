import {
  Project,
  ProjectContext,
  ProjectInsight,
  ProjectStatus,
  ProjectReport,
  ProjectContextType,
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

// Create a new project
export async function createProject(
  name: string,
  description: string,
  goals?: string[],
  tags?: string[]
): Promise<Project> {
  await ensureProjectsDir();
  
  // Generate human-readable project ID
  const baseId = generateProjectId();
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
  
  let prompt = `# Project: ${project.name}\n\n`;
  prompt += `## Description\n${project.description}\n\n`;
  
  if (project.goals.length > 0) {
    prompt += `## Goals\n`;
    project.goals.forEach((goal: string) => {
      prompt += `- ${goal}\n`;
    });
    prompt += `\n`;
  }
  
  if (insights.length > 0) {
    prompt += `## Key Insights\n`;
    insights.slice(0, 5).forEach(insight => {
      prompt += `### ${insight.title} (${insight.impact} impact)\n`;
      prompt += `${insight.description}\n\n`;
    });
  }
  
  // Add code changes with diffs
  const codeChanges = contexts.filter(c => c.tags?.includes("code-change"));
  if (codeChanges.length > 0) {
    prompt += `## Code Changes\n`;
    codeChanges.forEach(change => {
      prompt += `### ${change.content.split('\n')[0]}\n`; // First line as title
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
  
  // Add file references
  const fileReferences = contexts.filter(c => c.tags?.includes("file-reference"));
  if (fileReferences.length > 0) {
    prompt += `## Referenced Files\n`;
    fileReferences.forEach(ref => {
      const lines = ref.content.split('\n');
      prompt += `- ${lines[0]}\n`; // File path
      if (lines[1]) prompt += `  ${lines[1]}\n`; // Description
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
  
  // Add project metadata
  prompt += `## Project Metadata\n`;
  prompt += `- **Status**: ${project.status}\n`;
  prompt += `- **Created**: ${project.createdAt.toISOString()}\n`;
  prompt += `- **Last Updated**: ${project.updatedAt.toISOString()}\n`;
  prompt += `- **Total Contexts**: ${contexts.length}\n`;
  prompt += `- **Total Insights**: ${insights.length}\n`;
  prompt += `- **Total Tasks**: ${tasks.length}\n`;
  if (project.tags.length > 0) {
    prompt += `- **Tags**: ${project.tags.join(", ")}\n`;
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