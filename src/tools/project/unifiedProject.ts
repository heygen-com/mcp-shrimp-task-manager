import { z } from "zod";
import {
  getAllProjects,
  createProject,
  updateProject as updateProjectModel,
  deleteProject as deleteProjectModel,
  generateProjectStarterPrompt,
  setActiveProject,
  renameProject,
} from "../../models/projectModel.js";
import { Project, ProjectStatus, TrackerType, ProjectPriority, ProjectCategory, Task, ProjectContext, ProjectInsight, TaskStatus } from "../../types/index.js";
import { Memory } from "../../types/memory.js";
import path from "path";

// Type declaration for agent orchestration variable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  // eslint-disable-next-line no-var
  var __projectCreateExpertResponse: string | undefined;
}

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
    "list_jira_projects",
    "rename",
    "add_file",
    "remove_file",
    "help"
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
  
  // File management
  filePath: z.string().optional().describe("File path to add or remove from project (will be converted to absolute path)"),
  
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
  includeFullContext: z.boolean().optional().default(true).describe("Include recent context entries"),
  
  // For wizard mode
  wizardStep: z.string().optional().describe("Current wizard step"),
  wizardData: z.record(z.any()).optional().describe("Wizard state data"),
  
  // For JIRA integration
  jiraProjectKey: z.string().optional().describe("JIRA project key for epic creation (e.g., 'TRANS', 'EP')"),
  createEpic: z.boolean().optional().describe("Whether to create a JIRA epic"),
  
  // For rename action
  newName: z.string().optional().describe("New semantic project name (required for rename)"),
}).describe("Unified project management tool");

// Project tool actions overview for agent context
export const projectToolActionsOverview = `
# Project Tool Actions

| Action           | Parameters                        | Description                                      | Example Usage                                 |
|------------------|-----------------------------------|--------------------------------------------------|-----------------------------------------------|
| create           | name*, description, tags, ...     | Create a new project                             | project create --name "My Project"            |
| open             | projectId OR name                 | Open a project by ID or fuzzy name/tags          | project open --name "localization"            |
| list             | status, includeFullContext        | List all projects (optionally filter by status)  | project list                                   |
| update           | projectId, updates                | Update project fields                            | project update --projectId <id> --updates ...  |
| delete           | projectId                         | Delete a project                                 | project delete --projectId <id>                |
| rename           | projectId, newName                | Rename a project (folder & metadata)             | project rename --projectId <id> --newName ...  |
| add_file         | projectId, filePath               | Add a file to project context (absolute path)    | project add_file --projectId <id> --filePath ...  |
| remove_file      | projectId, filePath               | Remove a file from project context               | project remove_file --projectId <id> --filePath ... |
| generate_prompt  | projectId                         | Generate starter prompt for a project            | project generate_prompt --projectId <id>       |
| link_jira        | projectId, jiraProjectKey         | Link project to a JIRA epic                      | project link_jira --projectId <id> ...         |
| list_jira_projects|                                   | List all JIRA projects                           | project list_jira_projects                     |
| help             |                                   | Show this actions overview                       | project help                                   |

*Parameters marked with * are required. Most actions accept additional metadata fields (see schema).
`;

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

        // --- Duplicate detection logic start ---
        const allProjects = await getAllProjects();
        const newProjectNameLower = name.toLowerCase();
        const similarProjects = allProjects.filter(p => {
          const existingNameLower = p.name.toLowerCase();
          return existingNameLower.includes(newProjectNameLower) || newProjectNameLower.includes(existingNameLower);
        });
        if (similarProjects.length > 0) {
          let problemDescription = `Attempting to create project "${name}" (Description: ${description}). Potential duplicates found. Please advise:\n1. Proceed with creating "${name}".\n2. Open existing project (provide ID from list below).\n3. Cancel creation.\n\nPotential duplicates:\n`;
          similarProjects.forEach(p => {
            problemDescription += `- ${p.name} (ID: ${p.id}) Description: ${p.description || 'N/A'}\n`;
          });
          // Call consult_expert tool (agent will handle this call)
          // The following is a conceptual placeholder for agent orchestration:
          // const expertResponse = await consult_expert({ problem_description: problemDescription, relevant_context: `New project name: "${name}", New project description: "${description}"`, task_goal: "Decide whether to create a new project or open an existing one." });
          // let responseText = expertResponse.text.toLowerCase();
          // For this code, assume responseText is provided by the agent:
          if (typeof globalThis.__projectCreateExpertResponse === 'string') {
            const responseText = globalThis.__projectCreateExpertResponse.toLowerCase();
            if (responseText.includes("proceed") || responseText.includes("option 1")) {
              // Continue to creation below
            } else if (responseText.includes("open")) {
              const match = responseText.match(/([a-f0-9-]+)/i);
              const projectIdToOpen = match ? match[1] : null;
              if (projectIdToOpen) {
                const projectToOpen = allProjects.find(p => p.id.toLowerCase() === projectIdToOpen.toLowerCase());
                if (projectToOpen) {
                  await setActiveProject(projectToOpen.id, projectToOpen.name);
                  return { content: [{ type: "text", text: `✅ Project '${projectToOpen.name}' (ID: ${projectToOpen.id}) is now active. Creation of new project "${name}" was skipped.` }] };
                } else {
                  return { content: [{ type: "text", text: `⚠️ Could not find project with ID "${projectIdToOpen}" among potential duplicates. Project "${name}" was not created.` }] };
                }
              } else {
                return { content: [{ type: "text", text: `⚠️ No valid project ID specified for opening. Project "${name}" was not created.` }] };
              }
            } else {
              // Cancel or ambiguous
              return { content: [{ type: "text", text: `Project creation for "${name}" cancelled by user or due to ambiguous response regarding potential duplicates.` }] };
            }
          } else {
            // If not running in agent orchestration, return prompt for agent to handle consult_expert
            return { content: [{ type: "text", text: problemDescription }] };
          }
        }
        // --- Duplicate detection logic end ---

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
        let projectIdToOpen = params.projectId;
        let project = null;
        const queryName = typeof params.name === 'string' ? params.name : undefined;
        const allProjects = await getAllProjects();
        // Fuzzy open logic
        if (!projectIdToOpen && queryName) {
          // Try exact match first
          const exact = allProjects.find(p => p.name.toLowerCase() === queryName.toLowerCase());
          if (exact) {
            projectIdToOpen = exact.id;
            project = exact;
          } else {
            // Fuzzy match by name, tags, or description
            const query = queryName.toLowerCase();
            const candidates = allProjects.filter(p =>
              p.name.toLowerCase().includes(query) ||
              (p.tags && p.tags.some(tag => tag.toLowerCase().includes(query))) ||
              (p.description && p.description.toLowerCase().includes(query))
            );
            if (candidates.length === 1) {
              projectIdToOpen = candidates[0].id;
              project = candidates[0];
            } else if (candidates.length > 1) {
              let list = `Multiple projects match your query '${queryName}':\n`;
              for (const p of candidates) {
                list += `- **${p.name}** (ID: ${p.id})\n`;
              }
              list += `\nPlease specify the projectId to open.`;
              return { content: [{ type: "text", text: list }] };
            } else {
              return { content: [{ type: "text", text: `❌ No project found matching '${queryName}'.` }] };
            }
          }
        }
        if (!projectIdToOpen) {
          return { content: [{ type: "text", text: "❌ projectId or name is required to open a project." }] };
        }
        if (!project) {
          project = allProjects.find(p => p.id === projectIdToOpen);
        }
        if (!project) {
          return { content: [{ type: "text", text: `❌ Project ${projectIdToOpen} not found.` }] };
        }
        // Set as active project
        await setActiveProject(project.id, project.name);
        if (params.includeFullContext !== false) {
          // Load full context and memory files, and generate markdown
          const [contexts, insights, tasks]: [ProjectContext[], ProjectInsight[], Task[]] = await Promise.all([
            import("../../models/projectModel.js").then(m => m.getProjectContexts(project.id)),
            import("../../models/projectModel.js").then(m => m.getProjectInsights(project.id)),
            import("../../models/projectModel.js").then(m => m.getProjectTasks(project.id)),
          ]);

          // Read project files
          const { readProjectFiles } = await import("../../models/projectModel.js");
          const { fileContents, missingFiles, errors } = await readProjectFiles(project.id);

          // --- Project Memory Context Injection (moved up to fix build error) ---
          const { queryMemories } = await import("../../models/memoryModel.js");
          const projectTags = (project.tags || []).map(t => t.toLowerCase());
          const isLocalization = projectTags.some(t => ["i18n", "localization", "translation", "internationalization"].includes(t))
            || /i18n|localization|translation/.test(project.name.toLowerCase())
            || /i18n|localization|translation/.test(project.description.toLowerCase());
          let fuzzyTags = [...projectTags];
          if (isLocalization) {
            fuzzyTags = Array.from(new Set([...fuzzyTags, "i18n", "localization", "translation", "ICU"]));
          }
          let allMemories: Memory[] = [];
          let memoryError = null;
          try {
            allMemories = await queryMemories({});
            await logDebug(`Loaded ${allMemories.length} total memories for project ${project.id}`);
          } catch (err) {
            memoryError = err instanceof Error ? err.message : String(err);
            await logDebug(`Error loading memories: ${memoryError}`);
          }
          const projectMemories = allMemories.filter((m: Memory) => m.projectId === project.id);
          const tagMatchedMemories = allMemories.filter((m: Memory) =>
            m.projectId !== project.id && m.tags && m.tags.some((tag: string) => fuzzyTags.includes(tag.toLowerCase()))
          );
          await logDebug(`Project ${project.id}: ${projectMemories.length} project-specific memories, ${tagMatchedMemories.length} tag-matched memories`);

          // Start building the main markdown content
          let markdown = `# Project: ${project.name}\n\n`;
          markdown += `## Description\n${project.description}\n\n`;
          if (project.goals && project.goals.length > 0) {
            markdown += `## Goals\n`;
            project.goals.forEach((goal: string) => {
              markdown += `- ${goal}\n`;
            });
            markdown += `\n`;
          }
          
          // Key Insights, Important Context, Referenced Files, Current Tasks (Order remains same)
          if (insights && insights.length > 0) {
            markdown += `## Key Insights\n`;
            insights.slice(0, 5).forEach(insight => {
              markdown += `### ${insight.title} (${insight.impact} impact)\n`;
              markdown += `${insight.description}\n\n`;
            });
          }
          if (contexts.length > 0) {
            markdown += `## Important Context\n`;
            const importantContexts = contexts.filter(c =>
              c.tags?.includes("important") ||
              (!c.tags?.includes("code-change") && c.type !== "reference")
            ).slice(0, 5);
            importantContexts.forEach(context => {
              const preview = context.content.length > 200
                ? context.content.substring(0, 200) + "..."
                : context.content;
              markdown += `- **${context.type}**: ${preview}\n`;
            });
            markdown += `\n`;
          }
          const fileRefs = contexts.filter(c => c.tags?.includes("file-reference"));
          if (fileRefs.length > 0) {
            markdown += `## Referenced Files\n`;
            fileRefs.forEach(ref => {
              const lines = ref.content.split('\n');
              markdown += `- ${lines[0]}\n`;
              if (lines[1]) markdown += `  ${lines[1]}\n`;
            });
            markdown += `\n`;
          }
          const incompleteTasks = tasks.filter((t: Task) => t.status !== TaskStatus.COMPLETED);
          if (incompleteTasks.length > 0) {
            markdown += `## Current Tasks\n`;
            incompleteTasks.slice(0, 10).forEach((task: Task) => {
              markdown += `- [ ] **${task.name}**: ${task.description}\n`;
              if (task.notes) {
                markdown += `  Notes: ${task.notes.substring(0, 100)}${task.notes.length > 100 ? '...' : ''}\n`;
              }
            });
            markdown += `\n`;
          }
          
          // Project Metadata
          markdown += `## Project Metadata\n`;
          markdown += `- **Status**: ${project.status}\n`;
          if (project.priority) {
            markdown += `- **Priority**: ${project.priority}\n`;
          }
          if (project.category) {
            markdown += `- **Category**: ${project.category}\n`;
          }
          markdown += `- **Created**: ${project.createdAt.toISOString()}\n`;
          markdown += `- **Last Updated**: ${project.updatedAt.toISOString()}\n`;
          markdown += `- **Total Contexts**: ${contexts.length}\n`;
          markdown += `- **Total Memories**: ${projectMemories.length + tagMatchedMemories.length} (Project-relevant)\n`;
          markdown += `- **Total Insights**: ${insights.length}\n`;
          markdown += `- **Total Tasks**: ${tasks.length}\n`;
          if (project.files && project.files.length > 0) {
            markdown += `- **Project Files**: ${project.files.length} files (${fileContents.length} readable)\n`;
          }
          if (project.tags && project.tags.length > 0) {
            markdown += `- **Tags**: ${project.tags.join(", ")}\n`;
          }
          if (project.externalTracker) {
            markdown += `\n### External Tracker\n`;
            markdown += `- **Type**: ${project.externalTracker.type.toUpperCase()}\n`;
            markdown += `- **Issue**: ${project.externalTracker.issueKey}`;
            if (project.externalTracker.issueType) {
              markdown += ` (${project.externalTracker.issueType})`;
            }
            markdown += `\n`;
            if (project.externalTracker.url) {
              markdown += `- **URL**: ${project.externalTracker.url}\n`;
            }
          }
          
          // Appendix for Referenced Markdown File Contents (from context tags)
          const fs = await import("fs/promises");
          let contextAppendix = "";
          for (const ref of fileRefs) {
            const lines = ref.content.split('\n');
            const filePath = lines[0].trim();
            if (filePath.endsWith('.md')) {
              try {
                await fs.access(filePath);
                const fileContent = await fs.readFile(filePath, "utf-8");
                contextAppendix += `\n---\n### Appendix: ${filePath}\n`;
                if (lines[1]) contextAppendix += `*${lines[1].trim()}*\n`;
                contextAppendix += `\n\n` + fileContent + `\n`;
              } catch {
                // Skip files that cannot be accessed or read
              }
            }
          }
          if (contextAppendix) {
            markdown += `\n## Appendix: Referenced Context Files\n` + contextAppendix;
          }

          // --- Project Memory Context Injection ---
          markdown += `\n## 📚 Project Memories\n`;
          let memorySummary = "";
          if (memoryError) {
            memorySummary = `Error loading memories: ${memoryError}\n`;
          } else if (projectMemories.length === 0 && tagMatchedMemories.length === 0) {
            memorySummary = `No relevant memories found for this project.\n`;
          } else {
            memorySummary = `Relevant Memories:\n`;
            projectMemories.forEach(mem => {
              memorySummary += `- ${mem.summary} [${mem.type}] (${new Date(mem.created).toLocaleDateString()}) | Tags: ${mem.tags.join(", ")}\n`;
            });
            tagMatchedMemories.forEach(mem => {
              memorySummary += `- ${mem.summary} [${mem.type}] (${new Date(mem.created).toLocaleDateString()}) | Tags: ${mem.tags.join(", ")}\n`;
            });
          }
          markdown += memorySummary;
          
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
            markdown += projectFilesAppendix;
          }

          // Respond with the combined markdown
          return { content: [{ type: "text", text: markdown }] };
        } else {
          return { content: [{ type: "text", text: `✅ Project '${project.name}' is now active.` }] };
        }
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
        
      case "rename": {
        if (!params.projectId || !params.newName) {
          return { content: [{ type: "text", text: "❌ projectId and newName are required for renaming a project." }] };
        }
        try {
          const updatedProject = await renameProject(params.projectId, params.newName);
          // Generate markdown summary
          let markdown = `# Project Renamed\n\n`;
          markdown += `**New Name:** ${updatedProject.name}\n`;
          markdown += `**New ID:** ${updatedProject.id}\n`;
          markdown += `**Description:** ${updatedProject.description}\n`;
          markdown += `**Status:** ${updatedProject.status}\n`;
          markdown += `**Created:** ${updatedProject.createdAt.toISOString()}\n`;
          markdown += `**Last Updated:** ${updatedProject.updatedAt.toISOString()}\n`;
          if (updatedProject.tags && updatedProject.tags.length > 0) {
            markdown += `**Tags:** ${updatedProject.tags.join(", ")}\n`;
          }
          return { content: [{ type: "text", text: markdown }] };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: `❌ Failed to rename project: ${errorMessage}` }] };
        }
      }
        
      case "add_file": {
        if (!params.projectId || !params.filePath) {
          return { content: [{ type: "text", text: "❌ projectId and filePath are required for adding a file." }] };
        }
        
        try {
          const { addProjectFile, normalizeProjectFilePaths } = await import("../../models/projectModel.js");
          
          // Normalize paths to absolute before adding
          await normalizeProjectFilePaths(params.projectId);
          
          const added = await addProjectFile(params.projectId, params.filePath);
          
          if (added) {
            // Get the absolute path that was actually added
            const absolutePath = path.isAbsolute(params.filePath) 
              ? params.filePath 
              : path.resolve(params.filePath);
            
            let response = `✅ File added to project!\n\n`;
            response += `📁 File: ${absolutePath}\n`;
            response += `📋 Project: ${params.projectId}\n\n`;
            response += `The file content will now be included when opening the project.`;
            
            return { content: [{ type: "text", text: response }] };
          } else {
            return { content: [{ type: "text", text: `⚠️ File is already in the project: ${params.filePath}` }] };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: `❌ Failed to add file: ${errorMessage}` }] };
        }
      }
        
      case "remove_file": {
        if (!params.projectId || !params.filePath) {
          return { content: [{ type: "text", text: "❌ projectId and filePath are required for removing a file." }] };
        }
        
        try {
          const { removeProjectFile } = await import("../../models/projectModel.js");
          
          const removed = await removeProjectFile(params.projectId, params.filePath);
          
          if (removed) {
            let response = `✅ File removed from project!\n\n`;
            response += `📁 File: ${params.filePath}\n`;
            response += `📋 Project: ${params.projectId}\n\n`;
            response += `The file will no longer be included when opening the project.`;
            
            return { content: [{ type: "text", text: response }] };
          } else {
            return { content: [{ type: "text", text: `⚠️ File not found in project: ${params.filePath}` }] };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: `❌ Failed to remove file: ${errorMessage}` }] };
        }
      }
        
      case "help": {
        return { content: [{ type: "text", text: projectToolActionsOverview }] };
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

// --- Logging helper ---
const logPath = "/tmp/mcp_project_open_debug.log";
async function logDebug(msg: string) {
  try {
    const fsLog = await import("fs/promises");
    await fsLog.appendFile(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // Ignore logging errors
  }
}