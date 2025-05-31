import { z } from "zod";
import {
  getAllProjects,
  createProject,
  updateProject as updateProjectModel,
  deleteProject as deleteProjectModel,
  generateProjectStarterPrompt,
} from "../../models/projectModel.js";
import { Project, ProjectStatus } from "../../types/index.js";
import { queryMemories } from "../../models/memoryModel.js";
import { MemoryType } from "../../types/memory.js";

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
        const projectId = params.projectId || '';
        let prompt = await generateProjectStarterPrompt(projectId);
        
        if (!prompt) {
          return { content: [{ type: "text", text: `Project not found: ${projectId}` }] };
        }
        
        // Load the project to get its tags and description
        const projects = await getAllProjects();
        const currentProject = projects.find(p => p.id === projectId);
        
        // Load memories associated with this project
        try {
          // First, get memories directly associated with this project
          const projectMemories = await queryMemories({
            filters: {
              projectId: projectId,
              archived: false
            },
            sortBy: 'relevance',
            limit: 10 // Load top 10 most relevant memories
          });
          
          // Then, search for memories by matching tags and content
          let tagBasedMemories: typeof projectMemories = [];
          if (currentProject) {
            // Check if this is a localization/i18n project
            const isLocalizationProject = 
              currentProject.tags?.some(tag => 
                ['i18n', 'localization', 'translation', 'internationalization'].includes(tag.toLowerCase())
              ) ||
              currentProject.name.toLowerCase().includes('i18n') ||
              currentProject.name.toLowerCase().includes('localization') ||
              currentProject.name.toLowerCase().includes('translation') ||
              currentProject.description?.toLowerCase().includes('i18n') ||
              currentProject.description?.toLowerCase().includes('localization') ||
              currentProject.description?.toLowerCase().includes('translation');
            
            if (isLocalizationProject) {
              // Search for localization-related memories
              const localizationMemories = await queryMemories({
                filters: {
                  tags: ['i18n', 'localization', 'translation', 'ICU'],
                  archived: false
                },
                sortBy: 'relevance',
                limit: 5
              });
              tagBasedMemories = localizationMemories.filter(m => !m.projectId || m.projectId !== projectId);
            } else if (currentProject.tags && currentProject.tags.length > 0) {
              // For other projects, search by matching tags
              const tagMemories = await queryMemories({
                filters: {
                  tags: currentProject.tags,
                  archived: false
                },
                sortBy: 'relevance',
                limit: 5
              });
              tagBasedMemories = tagMemories.filter(m => !m.projectId || m.projectId !== projectId);
            }
          }
          
          // Combine and deduplicate memories
          const allMemories = [...projectMemories];
          const seenIds = new Set(projectMemories.map(m => m.id));
          for (const memory of tagBasedMemories) {
            if (!seenIds.has(memory.id)) {
              allMemories.push(memory);
              seenIds.add(memory.id);
            }
          }
          
          if (allMemories.length > 0) {
            prompt += `\n\n## 📚 Project Memory Context\n\n`;
            
            // Separate project-specific and global memories
            const directMemories = allMemories.filter(m => m.projectId === projectId);
            const globalMemories = allMemories.filter(m => !m.projectId || m.projectId !== projectId);
            
            if (directMemories.length > 0) {
              prompt += `### Project-Specific Memories (${directMemories.length})\n\n`;
              
              // Group memories by type
              const memoryByType = directMemories.reduce((acc, memory) => {
                if (!acc[memory.type]) acc[memory.type] = [];
                acc[memory.type].push(memory);
                return acc;
              }, {} as Record<MemoryType, typeof directMemories>);
              
              // Display memories grouped by type
              for (const [type, memories] of Object.entries(memoryByType)) {
                prompt += `#### ${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}\n`;
                for (const memory of memories) {
                  prompt += `- **${memory.summary}** (${new Date(memory.created).toLocaleDateString()})\n`;
                  if (memory.tags.length > 0) {
                    prompt += `  Tags: ${memory.tags.join(', ')}\n`;
                  }
                  prompt += `  Relevance: ${(memory.relevanceScore * 100).toFixed(0)}%\n\n`;
                }
              }
            }
            
            if (globalMemories.length > 0) {
              prompt += `### Related Global Memories (${globalMemories.length})\n\n`;
              prompt += `*These memories match your project's context and may be helpful:*\n\n`;
              
              // Group global memories by type
              const globalByType = globalMemories.reduce((acc, memory) => {
                if (!acc[memory.type]) acc[memory.type] = [];
                acc[memory.type].push(memory);
                return acc;
              }, {} as Record<MemoryType, typeof globalMemories>);
              
              // Display global memories
              for (const [type, memories] of Object.entries(globalByType)) {
                prompt += `#### ${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}\n`;
                for (const memory of memories) {
                  prompt += `- **${memory.summary}**\n`;
                  if (memory.tags.length > 0) {
                    prompt += `  Tags: ${memory.tags.join(', ')}\n`;
                  }
                  prompt += `  Relevance: ${(memory.relevanceScore * 100).toFixed(0)}%\n\n`;
                }
              }
            }
            
            prompt += `\n💡 *Use 'query_memory' to explore specific memories in detail.*\n`;
          }
        } catch (error) {
          console.error('Error loading project memories:', error);
          // Continue without memories if there's an error
        }
        
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
