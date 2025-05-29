import { z } from "zod";
import {
  getAllProjects,
  createProject,
  updateProject as updateProjectModel,
  deleteProject as deleteProjectModel,
  generateProjectStarterPrompt,
} from "../../models/projectModel.js";
import { Project, ProjectStatus } from "../../types/index.js";

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
export async function project(params: z.infer<typeof projectSchema>) {
  try {
    switch (params.action) {
      case "create": {
        const name = params.name || "Untitled Project";
        const description = params.description || "No description provided.";
        const project = await createProject(
          name,
          description,
          params.goals,
          params.tags
        );
        return { content: [{ type: "text", text: `Project created: ${project.name} (ID: ${project.id})` }] };
      }
        
      case "list": {
        const projects = await getAllProjects();
        let filteredProjects = projects;
        if (params.status && typeof params.status === 'string') {
          filteredProjects = projects.filter((p) => p.status === params.status);
        }
        let output = `# Projects (${filteredProjects.length})\n\n`;
        for (const project of filteredProjects) {
          output += `- **${project.name}** (ID: ${project.id})\n`;
        }
        return {
          content: [{ type: "text", text: output }],
        };
      }
        
      case "update": {
        const updateData: Partial<Project> = {
          name: params.name,
          description: params.description,
          status: params.status && typeof params.status === 'string' && ProjectStatus[params.status.toUpperCase() as keyof typeof ProjectStatus] ? ProjectStatus[params.status.toUpperCase() as keyof typeof ProjectStatus] : undefined,
          goals: params.goals,
          tags: params.tags,
        };
        const updatedProject = await updateProjectModel(params.projectId || '', updateData);
        if (!updatedProject) {
          return { content: [{ type: "text", text: `Project not found: ${params.projectId}` }] };
        }
        return { content: [{ type: "text", text: `Project updated: ${updatedProject.name}` }] };
      }
        
      case "delete": {
        const success = await deleteProjectModel(params.projectId || '');
        return { content: [{ type: "text", text: success ? `Project deleted: ${params.projectId}` : `Failed to delete project: ${params.projectId}` }] };
      }
        
      case "open": {
        const prompt = await generateProjectStarterPrompt(params.projectId || '');
        return { content: [{ type: "text", text: prompt }] };
      }
        
      case "generate_prompt": {
        const prompt = await generateProjectStarterPrompt(params.projectId || '');
        return { content: [{ type: "text", text: prompt }] };
      }
        
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

// Handle system check
async function handleSystemCheck() {
  // Remove or implement handleSystemCheck as needed. For now, return a placeholder.
  return { content: [{ type: "text", text: "System check not implemented." }] };
}
