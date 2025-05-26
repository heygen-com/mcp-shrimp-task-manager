import { z } from "zod";
import {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject as updateProjectModel,
  deleteProject as deleteProjectModel,
  addProjectContext,
  generateProjectStarterPrompt,
  getProjectContexts,
  getProjectInsights,
  getProjectTasks,
} from "../models/projectModel.js";
import { Project, ProjectContextType, ProjectStatus, TaskStatus } from "../types/index.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the unified schema
export const projectSchema = z.object({
  action: z.enum([
    "create",
    "update", 
    "delete",
    "list",
    "open",
    "generate_prompt",
    "system_check"
  ]).describe("Action to perform"),
  
  // For create action
  mode: z.enum(["wizard", "direct"]).optional().describe("Creation mode (wizard for interactive, direct for immediate)"),
  name: z.string().optional().describe("Project name"),
  description: z.string().optional().describe("Project description"),
  goals: z.array(z.string()).optional().describe("Project goals"),
  tags: z.array(z.string()).optional().describe("Project tags"),
  
  // For most actions
  projectId: z.string().optional().describe("Project ID"),
  
  // For update action
  updates: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["active", "paused", "completed", "archived"]).optional(),
    goals: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }).optional().describe("Fields to update"),
  
  // For list action
  status: z.enum(["active", "paused", "completed", "archived"]).optional().describe("Filter by status"),
  includeStats: z.boolean().optional().default(false).describe("Include statistics"),
  
  // For open action
  includeFullContext: z.boolean().optional().default(false).describe("Include recent context entries"),
  
  // For wizard mode
  wizardStep: z.string().optional().describe("Current wizard step"),
  wizardData: z.record(z.any()).optional().describe("Wizard state data"),
}).describe("Unified project management tool");

/**
 * Unified project management tool
 */
async function projectImpl(params: z.infer<typeof projectSchema>) {
  const startTime = Date.now();
  
  try {
    switch (params.action) {
      case "create":
        if (params.mode === "wizard") {
          return await handleCreateWizard(params);
        } else {
          // Direct creation
          if (!params.name || !params.description) {
            return {
              content: [{
                type: "text" as const,
                text: "❌ Project name and description are required for direct creation."
              }]
            };
          }
          
          const project = await createProject(
            params.name,
            params.description,
            params.goals,
            params.tags
          );
          
          // Logging removed - not available in current structure
          
          return {
            content: [{
              type: "text" as const,
              text: `✅ Project created successfully!\n\n` +
                `**Name:** ${project.name}\n` +
                `**ID:** ${project.id}\n` +
                `**Location:** data/projects/${project.id}/\n\n` +
                `Use \`project(action="open", projectId="${project.id}")\` to start working on it.`
            }]
          };
        }
        
      case "list":
        const projects = await getAllProjects();
        const filteredProjects = params.status 
          ? projects.filter(p => p.status === params.status)
          : projects;
        
        if (filteredProjects.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: params.status 
                ? `No ${params.status} projects found.`
                : "No projects found. Create one with `project(action=\"create\")`"
            }]
          };
        }
        
        let output = `# Projects (${filteredProjects.length})\n\n`;
        
        for (const project of filteredProjects) {
          output += `## ${project.name}\n`;
          output += `- **ID:** ${project.id}\n`;
          output += `- **Status:** ${project.status}\n`;
          output += `- **Description:** ${project.description}\n`;
          
          if (params.includeStats) {
            const contexts = await getProjectContexts(project.id);
            const tasks = await getProjectTasks(project.id);
            output += `- **Contexts:** ${contexts.length}\n`;
            output += `- **Tasks:** ${tasks.length}\n`;
          }
          
          output += `- **Created:** ${project.createdAt.toISOString().split('T')[0]}\n\n`;
        }
        
        return {
          content: [{
            type: "text" as const,
            text: output
          }]
        };
        
      case "update":
        if (!params.projectId || !params.updates) {
          return {
            content: [{
              type: "text" as const,
              text: "❌ Project ID and updates are required."
            }]
          };
        }
        
        // Map the status string to ProjectStatus enum if provided
        const updateData: Partial<Project> = {
          ...params.updates,
          status: params.updates.status ? 
            ProjectStatus[params.updates.status.toUpperCase() as keyof typeof ProjectStatus] : 
            undefined
        };
        
        const updatedProject = await updateProjectModel(params.projectId, updateData);
        
        if (!updatedProject) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Project ${params.projectId} not found.`
            }]
          };
        }
        
        return {
          content: [{
            type: "text" as const,
            text: `✅ Project updated successfully!\n\n` +
              `**Name:** ${updatedProject.name}\n` +
              `**Status:** ${updatedProject.status}`
          }]
        };
        
      case "delete":
        if (!params.projectId) {
          return {
            content: [{
              type: "text" as const,
              text: "❌ Project ID is required."
            }]
          };
        }
        
        const success = await deleteProjectModel(params.projectId);
        
        return {
          content: [{
            type: "text" as const,
            text: success 
              ? `✅ Project ${params.projectId} deleted successfully.`
              : `❌ Failed to delete project ${params.projectId}.`
          }]
        };
        
      case "open":
        if (!params.projectId) {
          return {
            content: [{
              type: "text" as const,
              text: "❌ Project ID is required."
            }]
          };
        }
        
        return await handleOpenProject(params.projectId, params.includeFullContext || false);
        
      case "generate_prompt":
        if (!params.projectId) {
          return {
            content: [{
              type: "text" as const,
              text: "❌ Project ID is required."
            }]
          };
        }
        
        const prompt = await generateProjectStarterPrompt(params.projectId);
        
        if (!prompt) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Project ${params.projectId} not found.`
            }]
          };
        }
        
        return {
          content: [{
            type: "text" as const,
            text: `✅ Starter prompt generated and saved!\n\n` +
              `**Files created:**\n` +
              `- data/projects/${params.projectId}/STARTER_PROMPT.md\n` +
              `- data/projects/${params.projectId}/starter-prompt-${new Date().toISOString().split('T')[0]}.md\n\n` +
              `The prompt contains all project context, code changes, insights, and tasks.`
          }]
        };
        
      case "system_check":
        return await handleSystemCheck();
        
      default:
        return {
          content: [{
            type: "text" as const,
            text: `❌ Unknown action: ${params.action}`
          }]
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Error logging removed - not available in current structure
    
    return {
      content: [{
        type: "text" as const,
        text: `Error in project tool: ${errorMessage}`
      }]
    };
  }
}

// Handle the create wizard flow
async function handleCreateWizard(params: z.infer<typeof projectSchema>) {
  const step = params.wizardStep || "start";
  const wizardData = params.wizardData || {};
  
  switch (step) {
    case "start":
      const suggestedName = "New Project " + new Date().toLocaleDateString();
      return {
        content: [{
          type: "text" as const,
          text: `🚀 **Project Creation Wizard**\n\n` +
            `I'll guide you through creating a comprehensive project.\n\n` +
            `**Suggested project name:** "${suggestedName}"\n\n` +
            `Please provide:\n` +
            `1. A project name (or use the suggested one)\n` +
            `2. A brief description of what this project is about\n\n` +
            `*Call: \`project(action="create", mode="wizard", wizardStep="gather_info", name="...", description="...")\`*`
        }]
      };
      
    case "gather_info":
      if (!params.name || !params.description) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ Please provide both project name and description.`
          }]
        };
      }
      
      // Store the data
      wizardData.name = params.name;
      wizardData.description = params.description;
      
      return {
        content: [{
          type: "text" as const,
          text: `✅ Great! I have:\n\n` +
            `**Name:** ${params.name}\n` +
            `**Description:** ${params.description}\n\n` +
            `Would you like to add:\n` +
            `1. Project goals (recommended)\n` +
            `2. Tags for organization\n\n` +
            `*Call: \`project(action="create", mode="wizard", wizardStep="add_goals", wizardData={...}, goals=["goal1", "goal2"], tags=["tag1", "tag2"])\`*\n` +
            `*Or skip: \`project(action="create", mode="wizard", wizardStep="confirm", wizardData={...})\`*`
        }]
      };
      
    case "add_goals":
      if (params.goals) wizardData.goals = params.goals;
      if (params.tags) wizardData.tags = params.tags;
      
      return {
        content: [{
          type: "text" as const,
          text: `✅ Project details:\n\n` +
            `**Name:** ${wizardData.name}\n` +
            `**Description:** ${wizardData.description}\n` +
            `**Goals:** ${wizardData.goals?.join(", ") || "None"}\n` +
            `**Tags:** ${wizardData.tags?.join(", ") || "None"}\n\n` +
            `Ready to create the project?\n\n` +
            `*Call: \`project(action="create", mode="wizard", wizardStep="confirm", wizardData={...})\`*`
        }]
      };
      
    case "confirm":
      // Create the project
      const project = await createProject(
        wizardData.name,
        wizardData.description,
        wizardData.goals,
        wizardData.tags
      );
      
      return {
        content: [{
          type: "text" as const,
          text: `🎉 **Project Created Successfully!**\n\n` +
            `**Name:** ${project.name}\n` +
            `**ID:** ${project.id}\n` +
            `**Location:** data/projects/${project.id}/\n\n` +
            `**Next Steps:**\n` +
            `• Open the project: \`project(action="open", projectId="${project.id}")\`\n` +
            `• Add context as you work: \`project_context(action="add", projectId="${project.id}", contextType="...", content="...")\`\n` +
            `• Generate starter prompt later: \`project(action="generate_prompt", projectId="${project.id}")\``
        }]
      };
      
    default:
      return {
        content: [{
          type: "text" as const,
          text: `❌ Unknown wizard step: ${step}`
        }]
      };
  }
}

// Handle open project (extracted for clarity)
async function handleOpenProject(projectId: string, includeFullContext: boolean) {
  const project = await getProjectById(projectId);
  
  if (!project) {
    return {
      content: [{
        type: "text" as const,
        text: `Project with ID ${projectId} not found.`
      }]
    };
  }
  
  // Get project data
  const contexts = await getProjectContexts(projectId);
  const insights = await getProjectInsights(projectId);
  const tasks = await getProjectTasks(projectId);
  
  const pendingTasks = tasks.filter(t => t.status === TaskStatus.PENDING);
  const inProgressTasks = tasks.filter(t => t.status === TaskStatus.IN_PROGRESS);
  const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED);
  
  // Count context types
  const contextCounts = contexts.reduce((acc, ctx) => {
    acc[ctx.type] = (acc[ctx.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Build system prompt
  let systemPrompt = `# Project: ${project.name}\n\n`;
  systemPrompt += `You are now working on the "${project.name}" project. `;
  systemPrompt += `This project ${project.description}\n\n`;
  
  systemPrompt += `## Project Context\n`;
  systemPrompt += `- Status: ${project.status}\n`;
  systemPrompt += `- Created: ${project.createdAt.toISOString().split('T')[0]}\n`;
  systemPrompt += `- Tasks: ${pendingTasks.length} pending, ${inProgressTasks.length} in progress, ${completedTasks.length} completed\n`;
  systemPrompt += `- Context Entries: ${contexts.length} total\n`;
  if (Object.keys(contextCounts).length > 0) {
    Object.entries(contextCounts).forEach(([type, count]) => {
      systemPrompt += `  - ${type}: ${count}\n`;
    });
  }
  systemPrompt += `- Insights/Breakthroughs: ${insights.length}\n\n`;
  
  systemPrompt += `## Your Responsibilities\n\n`;
  systemPrompt += `1. **Capture Context Proactively**: Use \`project_context(action="add", projectId="${project.id}", contextType="...", content="...")\` frequently to record:\n`;
  systemPrompt += `   - Any insights or breakthroughs (contextType: "breakthrough")\n`;
  systemPrompt += `   - Problems you encounter (contextType: "problem")\n`;
  systemPrompt += `   - Solutions you implement (contextType: "solution")\n`;
  systemPrompt += `   - Important decisions (contextType: "decision")\n`;
  systemPrompt += `   - Key learnings (contextType: "learning")\n`;
  systemPrompt += `   - Useful references (contextType: "reference")\n\n`;
  
  systemPrompt += `2. **Work on Tasks**: `;
  if (inProgressTasks.length > 0) {
    systemPrompt += `Continue with in-progress tasks: ${inProgressTasks.map(t => t.name).join(", ")}\n`;
  } else if (pendingTasks.length > 0) {
    systemPrompt += `Start with pending tasks. Use \`execute_task\` to begin.\n`;
  } else {
    systemPrompt += `All tasks are completed. Consider planning new tasks or generating a project report.\n`;
  }
  systemPrompt += `\n`;
  
  systemPrompt += `3. **Build on Previous Work**: `;
  if (contexts.length > 0) {
    systemPrompt += `This project has ${contexts.length} context entries. `;
    const recentBreakthroughs = contexts
      .filter(c => c.type === "breakthrough")
      .slice(0, 3);
    if (recentBreakthroughs.length > 0) {
      systemPrompt += `Recent breakthroughs include:\n`;
      recentBreakthroughs.forEach(b => {
        systemPrompt += `   - ${b.content.substring(0, 100)}${b.content.length > 100 ? '...' : ''}\n`;
      });
    }
  } else {
    systemPrompt += `This is a new project. Start capturing context as you work.\n`;
  }
  systemPrompt += `\n`;
  
  systemPrompt += `## Available Project Commands\n\n`;
  systemPrompt += `- \`project_context(action="add", projectId="${project.id}", contextType="...", content="...")\` - Capture learnings and insights\n`;
  systemPrompt += `- \`project_context(action="search", projectId="${project.id}", query="...")\` - Search context\n`;
  systemPrompt += `- \`project_context(action="analyze", projectId="${project.id}", analysisType="...")\` - Analyze patterns\n`;
  systemPrompt += `- \`list_tasks(projectId="${project.id}")\` - See project tasks\n`;
  systemPrompt += `- \`project(action="generate_prompt", projectId="${project.id}")\` - Get full context for resuming later\n\n`;
  
  systemPrompt += `## Project Goals\n`;
  if (project.goals.length > 0) {
    project.goals.forEach(goal => {
      systemPrompt += `- ${goal}\n`;
    });
  } else {
    systemPrompt += `No specific goals defined yet.\n`;
  }
  
  // Add recent context if requested
  if (includeFullContext && contexts.length > 0) {
    systemPrompt += `\n## Recent Context Entries\n`;
    contexts.slice(0, 5).forEach(ctx => {
      systemPrompt += `\n### ${ctx.type.toUpperCase()}: ${ctx.createdAt.toISOString().split('T')[0]}\n`;
      systemPrompt += `${ctx.content}\n`;
      if (ctx.tags && ctx.tags.length > 0) {
        systemPrompt += `Tags: ${ctx.tags.join(", ")}\n`;
      }
    });
  }
  
  // Logging removed - not available in current structure
  
  return {
    content: [{
      type: "text" as const,
      text: systemPrompt
    }]
  };
}

// Handle system check
async function handleSystemCheck() {
  const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const PROJECTS_DIR = path.join(DATA_DIR, "projects");
  
  let output = `# 🔍 MCP Shrimp Task Manager - System Check\n\n`;
  output += `## 1. Configuration\n\n`;
  
  // Environment variables
  output += `### Environment Variables\n`;
  output += `- **DATA_DIR**: ${process.env.DATA_DIR || "(not set - using default)"}\n`;
  output += `- **Resolved DATA_DIR**: ${DATA_DIR}\n`;
  output += `- **PROJECTS_DIR**: ${PROJECTS_DIR}\n`;
  output += `- **MCP_DEBUG_LOGGING**: ${process.env.MCP_DEBUG_LOGGING || "false"}\n`;
  output += `- **ENABLE_THOUGHT_CHAIN**: ${process.env.ENABLE_THOUGHT_CHAIN || "false"}\n`;
  output += `- **TEMPLATES_USE**: ${process.env.TEMPLATES_USE || "en"}\n\n`;
  
  // Check if directories exist
  output += `### Directory Status\n`;
  try {
    await fs.access(DATA_DIR);
    output += `- ✅ DATA_DIR exists: ${DATA_DIR}\n`;
  } catch {
    output += `- ❌ DATA_DIR does not exist: ${DATA_DIR}\n`;
  }
  
  try {
    await fs.access(PROJECTS_DIR);
    output += `- ✅ PROJECTS_DIR exists: ${PROJECTS_DIR}\n`;
  } catch {
    output += `- ⚠️ PROJECTS_DIR does not exist: ${PROJECTS_DIR} (will be created when needed)\n`;
  }
  
  output += `\n## 2. Projects Overview\n\n`;
  
  try {
    const projects = await getAllProjects();
    output += `**Total Projects**: ${projects.length}\n\n`;
    
    if (projects.length > 0) {
      output += `### Project List\n`;
      for (const project of projects) {
        const contexts = await getProjectContexts(project.id);
        const insights = await getProjectInsights(project.id);
        const tasks = await getProjectTasks(project.id);
        
        output += `\n#### ${project.name} (${project.id})\n`;
        output += `- **Status**: ${project.status}\n`;
        output += `- **Created**: ${project.createdAt.toISOString().split('T')[0]}\n`;
        output += `- **Contexts**: ${contexts.length}\n`;
        output += `- **Insights**: ${insights.length}\n`;
        output += `- **Tasks**: ${tasks.length}\n`;
        output += `- **Location**: ${path.join(PROJECTS_DIR, project.id)}\n`;
        
        // Check if project directory actually exists
        try {
          await fs.access(path.join(PROJECTS_DIR, project.id));
          output += `- **Directory**: ✅ Exists\n`;
        } catch {
          output += `- **Directory**: ❌ Missing!\n`;
        }
      }
    } else {
      output += `No projects found. Create one with \`project(action="create")\`\n`;
    }
  } catch (error) {
    output += `❌ Error reading projects: ${error instanceof Error ? error.message : String(error)}\n`;
  }
  
  output += `\n## 3. File System Permissions\n\n`;
  
  // Check write permissions
  try {
    const testFile = path.join(DATA_DIR, '.write-test');
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    output += `- ✅ Write permissions OK for DATA_DIR\n`;
  } catch {
    output += `- ❌ Cannot write to DATA_DIR\n`;
  }
  
  output += `\n## 4. Runtime Information\n\n`;
  output += `- **Node Version**: ${process.version}\n`;
  output += `- **Platform**: ${process.platform}\n`;
  output += `- **Architecture**: ${process.arch}\n`;
  output += `- **Current Working Directory**: ${process.cwd()}\n`;
  output += `- **Script Location**: ${__dirname}\n`;
  
  output += `\n## 5. Recommendations\n\n`;
  
  if (!process.env.DATA_DIR) {
    output += `⚠️ **Set DATA_DIR**: Consider setting DATA_DIR environment variable in your MCP configuration to control where project data is stored.\n\n`;
  }
  
  if (process.env.MCP_DEBUG_LOGGING !== "true") {
    output += `💡 **Enable Debug Logging**: Set MCP_DEBUG_LOGGING=true for detailed tool call logs.\n\n`;
  }
  
  output += `---\n\n`;
  output += `*Run this check periodically to ensure your MCP server is properly configured.*`;
  
  return {
    content: [{
      type: "text" as const,
      text: output
    }]
  };
}

// Export the implementation directly
export const project = projectImpl; 