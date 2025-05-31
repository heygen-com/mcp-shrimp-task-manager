import { z } from "zod";
import {
  getAllProjects,
  createProject,
  updateProject as updateProjectModel,
  deleteProject as deleteProjectModel,
  generateProjectStarterPrompt,
  findProjectBySemanticMatch,
} from "../../models/projectModel.js";
import { Project, ProjectStatus, TrackerType, ProjectPriority, ProjectCategory } from "../../types/index.js";
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
    "system_check",
    "link_jira",
    "list_jira_projects"
  ]).describe("Action to perform"),
  
  // For create action
  mode: z.enum(["wizard", "direct"]).optional().describe("Creation mode (wizard for interactive, direct for immediate)"),
  name: z.string().optional().describe("Project name"),
  description: z.string().optional().describe("Project description"),
  goals: z.array(z.string()).optional().describe("Project goals"),
  tags: z.array(z.string()).optional().describe("Project tags"),
  
  // External tracker integration
  trackerType: z.enum(["jira", "github", "gitlab", "linear", "asana", "trello", "notion", "other"]).optional().describe("External tracker type"),
  trackerIssueKey: z.string().optional().describe("Issue key (e.g., PROJ-123)"),
  trackerIssueType: z.string().optional().describe("Issue type (epic, story, task, bug)"),
  trackerUrl: z.string().optional().describe("Direct URL to the issue"),
  
  // Project metadata
  priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Project priority"),
  category: z.enum(["feature", "bugfix", "refactor", "research", "infrastructure", "documentation", "prototype", "migration"]).optional().describe("Project category"),
  owner: z.string().optional().describe("Project owner/lead"),
  team: z.string().optional().describe("Team name"),
  deadline: z.string().optional().describe("Project deadline (ISO date string)"),
  repository: z.string().optional().describe("Git repository URL"),
  
  // For most actions
  projectId: z.string().optional().describe("Project ID"),
  
  // For update action
  updates: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["active", "paused", "completed", "archived"]).optional(),
    goals: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    category: z.enum(["feature", "bugfix", "refactor", "research", "infrastructure", "documentation", "prototype", "migration"]).optional(),
    externalTracker: z.object({
      type: z.enum(["jira", "github", "gitlab", "linear", "asana", "trello", "notion", "other"]).optional(),
      issueKey: z.string().optional(),
      issueType: z.string().optional(),
      url: z.string().optional(),
    }).optional(),
    metadata: z.object({
      owner: z.string().optional(),
      team: z.string().optional(),
      deadline: z.string().optional(),
      repository: z.string().optional(),
    }).optional(),
  }).optional().describe("Fields to update"),
  
  // For list action
  status: z.enum(["active", "paused", "completed", "archived"]).optional().describe("Filter by status"),
  includeStats: z.boolean().optional().default(false).describe("Include statistics"),
  
  // For open action
  includeFullContext: z.boolean().optional().default(false).describe("Include recent context entries"),
  
  // For wizard mode
  wizardStep: z.string().optional().describe("Current wizard step"),
  wizardData: z.record(z.any()).optional().describe("Wizard state data"),
  
  // For JIRA integration
  jiraProjectKey: z.string().optional().describe("JIRA project key for epic creation (e.g., 'TRANS', 'EP')"),
  createEpic: z.boolean().optional().describe("Whether to create a JIRA epic"),
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
        if (!params.name || name.toLowerCase().startsWith('untitled')) {
          return { content: [{ type: "text", text: `⚠️ Please provide a semantically meaningful project name (e.g., 'translation_project', 'market_data_lake', 'ui_kit_deprecation'). This will be used for the project folder and makes it easier to search and manage projects.` }] };
        }
        
        // Create project without external tracker initially
        const metadata = (params.owner || params.team || params.deadline || params.repository) ? {
          owner: params.owner,
          team: params.team,
          deadline: params.deadline ? new Date(params.deadline) : undefined,
          repository: params.repository,
        } : undefined;
        
        const project = await createProject(
          name,
          description,
          params.goals,
          params.tags,
          params.priority as ProjectPriority,
          params.category as ProjectCategory,
          undefined, // No external tracker yet
          metadata
        );
        
        let response = `✅ Project created: **${project.name}** (ID: ${project.id})\n`;
        if (project.priority) {
          response += `\n🎯 Priority: ${project.priority}`;
        }
        if (project.metadata?.owner) {
          response += `\n👤 Owner: ${project.metadata.owner}`;
        }
        
        // Always prompt for JIRA epic linking
        response += `\n\nWould you like to link this project to a JIRA epic? Linking enables advanced features such as:\n`;
        response += `- Continuous mode (work through tickets automatically)\n`;
        response += `- Listing and managing JIRA tickets in this project\n`;
        response += `- Opening, updating, and closing JIRA tickets from the agent\n`;
        response += `\nTo link to an existing JIRA epic, run:\n`;
        response += `project link_jira --projectId "${project.id}" --jiraProjectKey <EPIC_KEY>\n\n`;
        response += `Example: project link_jira --projectId "${project.id}" --jiraProjectKey "TT-206"`;
        
        return { content: [{ type: "text", text: response }] };
      }
        
      case "list": {
        const projects = await getAllProjects();
        let filteredProjects = projects;
        if (params.status && typeof params.status === 'string') {
          filteredProjects = projects.filter((p) => p.status === params.status);
        }
        let output = `# Projects (${filteredProjects.length})\n\n`;
        for (const project of filteredProjects) {
          output += `- **${project.name}** (ID: ${project.id})`;
          if (project.priority) {
            output += ` [${project.priority.toUpperCase()}]`;
          }
          if (project.externalTracker) {
            output += ` | ${project.externalTracker.type}: ${project.externalTracker.issueKey}`;
          }
          if (project.metadata?.owner) {
            output += ` | Owner: ${project.metadata.owner}`;
          }
          if (project.metadata?.deadline) {
            const deadline = new Date(project.metadata.deadline);
            const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            output += ` | Due: ${deadline.toLocaleDateString()} (${daysLeft} days)`;
          }
          output += `\n`;
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
        let projectId = params.projectId || '';
        let prompt = await generateProjectStarterPrompt(projectId);
        if (!prompt) {
          let searchName = projectId;
          if (!searchName && params.name) searchName = params.name;
          if (searchName) {
            const match = await findProjectBySemanticMatch(searchName);
            if (Array.isArray(match)) {
              const list = match.map(p => `- **${p.name}** (ID: ${p.id})`).join('\n');
              return { content: [{ type: "text", text: `No exact project found for '${searchName}', but found these candidates:\n\n${list}\n\nPlease specify the project ID or a more specific name.` }] };
            } else if (match) {
              projectId = match.id;
              prompt = await generateProjectStarterPrompt(projectId);
            } else {
              return { content: [{ type: "text", text: `Project not found: ${searchName}` }] };
            }
          } else {
            return { content: [{ type: "text", text: `Project not found: ${projectId}` }] };
          }
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
        
      case "list_jira_projects": {
        try {
          // Import jiraToolHandler dynamically to avoid circular dependencies
          const { jiraToolHandler } = await import("../jiraTools.js");
          
          // Call JIRA API to get all projects
          const result = await jiraToolHandler({
            action: "list",
            domain: "project",
            context: {}
          });
          
          return { content: [{ type: "text", text: result.markdown }] };
        } catch (error) {
          return { content: [{ type: "text", text: `❌ Failed to list JIRA projects: ${error instanceof Error ? error.message : 'Unknown error'}` }] };
        }
      }
      
      case "link_jira": {
        if (!params.projectId) {
          return { content: [{ type: "text", text: `❌ Please provide projectId` }] };
        }
        
        if (!params.jiraProjectKey) {
          return { content: [{ type: "text", text: `❌ Please provide jiraProjectKey (e.g., TT-206)` }] };
        }
        
        try {
          // Get the project
          const projects = await getAllProjects();
          const project = projects.find(p => p.id === params.projectId);
          if (!project) {
            return { content: [{ type: "text", text: `❌ Project not found: ${params.projectId}` }] };
          }
          
          // Extract the full issue key
          const issueKey = params.jiraProjectKey;
          
          // Construct the JIRA URL (assuming standard Atlassian URL format)
          // If JIRA_BASE_URL is set, use it; otherwise construct from issue key
          const baseUrl = process.env.JIRA_BASE_URL || 'https://jira.atlassian.com';
          const epicUrl = `${baseUrl}/browse/${issueKey}`;
          
          // Import the updateJiraIssueLabels function dynamically
          const { updateJiraIssueLabels } = await import("../jiraTools.js");
          
          // Update the JIRA epic with the project ID as a label
          let jiraUpdateSuccess = true;
          let jiraUpdateError = "";
          try {
            await updateJiraIssueLabels(issueKey, [`project-${project.id}`]);
          } catch (jiraError) {
            // Don't use console.error as it interferes with MCP JSON response
            jiraUpdateSuccess = false;
            jiraUpdateError = jiraError instanceof Error ? jiraError.message : 'Unknown error';
          }
          
          // Update the project with the existing JIRA epic information
          await updateProjectModel(project.id, {
            externalTracker: {
              type: TrackerType.JIRA,
              issueKey: issueKey,
              issueType: "epic",
              url: epicUrl
            }
          });
          
          let response = `✅ Project linked to JIRA Epic!\n\n`;
          response += `📋 Epic: ${issueKey}\n`;
          response += `🔗 URL: ${epicUrl}\n`;
          response += `📁 Project: ${project.name} (${project.id})\n\n`;
          
          if (jiraUpdateSuccess) {
            response += `The project has been linked to the existing JIRA epic.\n`;
            response += `JIRA epic has been labeled with: project-${project.id}\n\n`;
            response += `✅ **Linking complete.** No further action needed.`;
          } else {
            response += `⚠️ The project has been linked locally, but could not update JIRA epic labels.\n`;
            response += `Error: ${jiraUpdateError}\n`;
            response += `You may need to manually add the label "project-${project.id}" to the JIRA epic.\n\n`;
            response += `✅ **Local linking complete.** No further action needed.`;
          }
          
          return { content: [{ type: "text", text: response }] };
        } catch (error) {
          return { content: [{ type: "text", text: `❌ Failed to link JIRA epic: ${error instanceof Error ? error.message : 'Unknown error'}` }] };
        }
      }
        
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
