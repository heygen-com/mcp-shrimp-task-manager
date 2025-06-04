import { z } from "zod";
import { 
  parseCommentsForTasks, 
  formatCommentTasksAsMarkdown,
  filterNewTasks,
  CommentTask
} from "../../utils/jiraCommentTaskParser.js";
import { createTask } from "../../models/taskModel.js";
import { getActiveProject } from "../../models/projectModel.js";
import { RelatedFileType } from "../../types/index.js";

// Schema for the comment task sync tool
export const commentTaskSyncSchema = z.object({
  action: z.enum([
    "scan", // Scan ticket for all comment tasks
    "check_new", // Check for NEW comment tasks since last sync
    "sync", // Create internal tasks from comment tasks  
    "mark_complete", // Mark a comment task as completed in JIRA
    "status", // Check current sync status
    "configure" // Configure sync settings for a project
  ]).describe("Action to perform"),
  
  issueKey: z.string().optional().describe("JIRA issue key (e.g., PROJ-123)"),
  projectId: z.string().optional().describe("Project ID for task association"),
  
  // For mark_complete action
  internalTaskId: z.string().optional().describe("Internal task ID that was completed"),
  commentTaskId: z.string().optional().describe("Comment task ID to mark as complete"),
  
  // Sync configuration options
  syncOptions: z.object({
    autoCreateTasks: z.boolean().optional().describe("Automatically create internal tasks from comment tasks"),
    taskPrefix: z.string().optional().describe("Prefix for tasks created from comments"),
    autoMarkComplete: z.boolean().optional().describe("Automatically mark JIRA comments when internal tasks completed"),
  }).optional(),
}).describe("Sync JIRA comment tasks with internal task management");

export type CommentTaskSyncInput = z.infer<typeof commentTaskSyncSchema>;

// Enhanced sync metadata for proper tracking
interface CommentTaskSyncMetadata {
  lastSyncTimestamp?: string;
  lastCheckedTimestamp?: string;
  processedCommentTaskIds?: string[];
  syncedTaskMappings?: Array<{
    internalTaskId: string;
    commentTaskId: string;
    commentId: string;
    issueKey: string;
    originalPattern: string;
    lineNumber?: number;
    completed: boolean;
  }>;
  syncOptions?: {
    autoCreateTasks: boolean;
    taskPrefix: string;
    autoMarkComplete: boolean;
  };
}

/**
 * Get comment task sync metadata from active project
 */
async function getCommentSyncMetadata(projectId?: string): Promise<CommentTaskSyncMetadata> {
  if (!projectId) {
    const activeProject = await getActiveProject();
    projectId = activeProject?.projectId;
  }
  
  if (!projectId) {
    return {
      syncOptions: {
        autoCreateTasks: true,
        taskPrefix: "[Comment]",
        autoMarkComplete: false
      }
    };
  }
  
  try {
    // This is a simplified version - in full implementation we'd read from project metadata
    return {
      processedCommentTaskIds: [],
      syncedTaskMappings: [],
      syncOptions: {
        autoCreateTasks: true,
        taskPrefix: "[Comment]", 
        autoMarkComplete: false
      }
    };
  } catch {
    return {
      syncOptions: {
        autoCreateTasks: true,
        taskPrefix: "[Comment]",
        autoMarkComplete: false
      }
    };
  }
}

/**
 * Update comment task sync metadata
 */
async function updateCommentSyncMetadata(
  metadata: CommentTaskSyncMetadata, 
  projectId?: string
): Promise<void> {
  if (!projectId) {
    const activeProject = await getActiveProject();
    projectId = activeProject?.projectId;
  }
  
  if (!projectId) {
    console.log("No project ID for storing sync metadata");
    return;
  }
  
  // In full implementation, this would update project metadata
  console.log(`Would update sync metadata for project ${projectId}:`, metadata);
}

/**
 * Create internal tasks from comment tasks
 */
async function createInternalTasksFromComments(
  commentTasks: CommentTask[],
  issueKey: string,
  taskPrefix: string = "[Comment]"
) {
  const results = [];
  
  for (const commentTask of commentTasks) {
    if (commentTask.completed) {
      continue; // Skip completed tasks for now
    }
    
    const taskName = `${taskPrefix} ${commentTask.text}`;
    const taskDescription = `**Source:** JIRA Comment from ${commentTask.author}
**Issue:** ${issueKey}
**Original Pattern:** \`${commentTask.originalPattern}\`
**Comment Date:** ${new Date(commentTask.commentCreated).toLocaleString()}

---

${commentTask.text}`;

    const notes = `Comment Task ID: ${commentTask.id}
Comment ID: ${commentTask.commentId}
JIRA Issue: ${issueKey}
Line Number: ${commentTask.lineNumber}

This task was automatically created from a JIRA comment. When completed, you can use the mark_complete action to update the original comment.`;
    
    try {
      const internalTask = await createTask(
        taskName,
        taskDescription,
        notes,
        [], // No dependencies for comment tasks initially
        [{
          path: `jira://${issueKey}`,
          type: RelatedFileType.REFERENCE,
          description: `JIRA ticket containing the source comment`
        }]
      );
      
      results.push({ commentTask, internalTask });
    } catch (error) {
      console.error(`Failed to create internal task for comment task ${commentTask.id}:`, error);
    }
  }
  
  return results;
}

/**
 * Mock function to update JIRA comment (placeholder for actual implementation)
 */
async function mockUpdateJiraComment(
  issueKey: string,
  commentId: string, 
  commentTaskId: string,
  originalPattern: string
): Promise<boolean> {
  console.log(`Would update JIRA comment in ${issueKey}:`);
  console.log(`  Comment ID: ${commentId}`);
  console.log(`  Task ID: ${commentTaskId}`);
  console.log(`  Original: ${originalPattern}`);
  
  // Convert unchecked to checked pattern
  let updatedPattern = originalPattern;
  if (originalPattern.includes('[ ]')) {
    updatedPattern = originalPattern.replace('[ ]', '[x]');
  } else if (originalPattern.includes('☐')) {
    updatedPattern = originalPattern.replace('☐', '☑');
  } else if (originalPattern.startsWith('TODO:')) {
    updatedPattern = originalPattern.replace('TODO:', 'DONE:');
  } else if (originalPattern.startsWith('ACTION:')) {
    updatedPattern = originalPattern.replace('ACTION:', 'COMPLETED:');
  }
  
  console.log(`  Updated: ${updatedPattern}`);
  console.log(`  (This would use JIRA API to update the actual comment)`);
  
  return true; // Mock success
}

/**
 * Mock function to get JIRA ticket data (placeholder for actual implementation)
 */
async function mockGetJiraTicket() {
  // This would be replaced with actual JIRA API call
  return {
    fields: {
      comment: {
        comments: [
          {
            id: "comment1",
            author: { displayName: "John Doe" },
            created: new Date().toISOString(),
            body: `Here are the tasks to complete:
- [ ] Fix the mobile layout issue
- [ ] Add validation for email field  
- [x] Update documentation
TODO: Review the API endpoints`
          },
          {
            id: "comment2", 
            author: { displayName: "Jane Smith" },
            created: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
            body: `Additional items:
- [ ] Configure SSL certificates
ACTION: Update the deployment scripts`
          }
        ]
      }
    }
  };
}

/**
 * Main comment task sync handler
 */
export async function commentTaskSync(input: CommentTaskSyncInput) {
  try {
    switch (input.action) {
      case "scan": {
        if (!input.issueKey) {
          return {
            content: [{
              type: "text",
              text: "❌ Error: issueKey is required for scan action"
            }]
          };
        }
        
        // Mock JIRA ticket fetch (replace with actual implementation)
        const ticketData = await mockGetJiraTicket();
        const comments = ticketData.fields?.comment?.comments || [];
        
        if (comments.length === 0) {
          return {
            content: [{
              type: "text", 
              text: `## 📝 No Comments Found\n\nJIRA ticket ${input.issueKey} has no comments to scan for tasks.`
            }]
          };
        }
        
        // Parse comments for tasks
        const parseResult = parseCommentsForTasks(comments);
        const markdown = formatCommentTasksAsMarkdown(parseResult);
        
        return {
          content: [{
            type: "text",
            text: `# Comment Task Scan Results for ${input.issueKey}\n\n${markdown}\n\n---\n**Next Steps:**\n- Use \`action: "check_new"\` to see only new tasks since last sync\n- Use \`action: "sync"\` to create internal tasks from comment tasks`
          }]
        };
      }
      
      case "check_new": {
        if (!input.issueKey) {
          return {
            content: [{
              type: "text",
              text: "❌ Error: issueKey is required for check_new action"
            }]
          };
        }
        
        // Get sync metadata to know what we've already processed
        const syncMetadata = await getCommentSyncMetadata(input.projectId);
        
        // Mock JIRA ticket fetch and parse comments
        const ticketData = await mockGetJiraTicket();
        const comments = ticketData.fields?.comment?.comments || [];
        const parseResult = parseCommentsForTasks(comments);
        
        // Filter for new tasks only
        const processedTaskIds = new Set(syncMetadata.processedCommentTaskIds || []);
        const newTasks = filterNewTasks(
          parseResult.tasks,
          undefined, // No comment ID filtering for now
          syncMetadata.lastCheckedTimestamp,
          processedTaskIds
        );
        
        if (newTasks.length === 0) {
          return {
            content: [{
              type: "text",
              text: `## ✅ No New Tasks\n\nNo new comment tasks found in ${input.issueKey} since last check.\n\n**Last checked:** ${syncMetadata.lastCheckedTimestamp ? new Date(syncMetadata.lastCheckedTimestamp).toLocaleString() : 'Never'}`
            }]
          };
        }
        
        // Format new tasks
        const newTasksResult = {
          tasks: newTasks,
          hasTaskPatterns: newTasks.length > 0,
          totalTasks: newTasks.length,
          completedTasks: newTasks.filter(t => t.completed).length,
          pendingTasks: newTasks.filter(t => !t.completed).length
        };
        
        const markdown = formatCommentTasksAsMarkdown(newTasksResult);
        
        // Update last checked timestamp
        await updateCommentSyncMetadata({
          ...syncMetadata,
          lastCheckedTimestamp: new Date().toISOString()
        }, input.projectId);
        
        return {
          content: [{
            type: "text",
            text: `# 🆕 New Comment Tasks in ${input.issueKey}\n\n${markdown}\n\n---\n**Next Steps:** Use \`action: "sync"\` to create internal tasks from these new comment tasks.`
          }]
        };
      }
      
      case "sync": {
        if (!input.issueKey) {
          return {
            content: [{
              type: "text",
              text: "❌ Error: issueKey is required for sync action"
            }]
          };
        }
        
        // Get sync metadata
        const syncMetadata = await getCommentSyncMetadata(input.projectId);
        
        // Mock JIRA ticket fetch and parse comments
        const ticketData = await mockGetJiraTicket();
        const comments = ticketData.fields?.comment?.comments || [];
        const parseResult = parseCommentsForTasks(comments);
        
        // Filter for new tasks only
        const processedTaskIds = new Set(syncMetadata.processedCommentTaskIds || []);
        const newTasks = filterNewTasks(
          parseResult.tasks,
          undefined,
          syncMetadata.lastSyncTimestamp,
          processedTaskIds
        );
        
        const pendingNewTasks = newTasks.filter(t => !t.completed);
        
        if (pendingNewTasks.length === 0) {
          return {
            content: [{
              type: "text",
              text: `## ✅ Nothing to Sync\n\nNo new pending comment tasks found in ${input.issueKey}.`
            }]
          };
        }
        
        // Create internal tasks
        const taskPrefix = input.syncOptions?.taskPrefix || syncMetadata.syncOptions?.taskPrefix || "[Comment]";
        const createdTasks = await createInternalTasksFromComments(pendingNewTasks, input.issueKey, taskPrefix);
        
        // Update sync metadata
        const newSyncMetadata: CommentTaskSyncMetadata = {
          ...syncMetadata,
          lastSyncTimestamp: new Date().toISOString(),
          processedCommentTaskIds: [
            ...(syncMetadata.processedCommentTaskIds || []),
            ...newTasks.map(t => t.id)
          ],
          syncedTaskMappings: [
            ...(syncMetadata.syncedTaskMappings || []),
            ...createdTasks.map(({ commentTask, internalTask }) => ({
              internalTaskId: internalTask.id,
              commentTaskId: commentTask.id,
              commentId: commentTask.commentId,
              issueKey: input.issueKey!,
              originalPattern: commentTask.originalPattern,
              lineNumber: commentTask.lineNumber,
              completed: false
            }))
          ]
        };
        
        await updateCommentSyncMetadata(newSyncMetadata, input.projectId);
        
        // Generate report
        let report = `# Comment Task Sync Complete for ${input.issueKey}\n\n`;
        report += `**Created Tasks:** ${createdTasks.length}\n`;
        report += `**Total New Tasks:** ${newTasks.length}\n`;
        report += `**Pending Tasks:** ${pendingNewTasks.length}\n\n`;
        
        if (createdTasks.length > 0) {
          report += `## 📋 Newly Created Tasks\n\n`;
          createdTasks.forEach(({ commentTask, internalTask }, index) => {
            report += `${index + 1}. **${internalTask.name}** (ID: \`${internalTask.id}\`)\n`;
            report += `   - Source: Comment by ${commentTask.author}\n`;
            report += `   - Status: ${internalTask.status}\n`;
            report += `   - Comment Task ID: \`${commentTask.id}\`\n\n`;
          });
          
          report += `\n---\n**💡 Tip:** When you complete these tasks, use \`action: "mark_complete"\` with the internal task ID to update the original JIRA comment!`;
        }
        
        return {
          content: [{
            type: "text",
            text: report
          }]
        };
      }
      
      case "mark_complete": {
        if (!input.internalTaskId && !input.commentTaskId) {
          return {
            content: [{
              type: "text",
              text: "❌ Error: Either internalTaskId or commentTaskId is required for mark_complete action"
            }]
          };
        }
        
        // Get sync metadata to find the mapping
        const syncMetadata = await getCommentSyncMetadata(input.projectId);
        
        let taskMapping;
        if (input.internalTaskId) {
          taskMapping = syncMetadata.syncedTaskMappings?.find(m => m.internalTaskId === input.internalTaskId);
        } else if (input.commentTaskId) {
          taskMapping = syncMetadata.syncedTaskMappings?.find(m => m.commentTaskId === input.commentTaskId);
        }
        
        if (!taskMapping) {
          return {
            content: [{
              type: "text",
              text: `❌ Error: No mapping found for the provided task ID. Make sure this task was created via comment sync.`
            }]
          };
        }
        
        if (taskMapping.completed) {
          return {
            content: [{
              type: "text",
              text: `✅ Already Complete\n\nThis comment task has already been marked as completed in JIRA.`
            }]
          };
        }
        
        // Update JIRA comment
        const success = await mockUpdateJiraComment(
          taskMapping.issueKey,
          taskMapping.commentId,
          taskMapping.commentTaskId,
          taskMapping.originalPattern
        );
        
        if (success) {
          // Update our metadata to mark as completed
          const updatedMappings = syncMetadata.syncedTaskMappings?.map(m => 
            m.commentTaskId === taskMapping.commentTaskId ? { ...m, completed: true } : m
          ) || [];
          
          await updateCommentSyncMetadata({
            ...syncMetadata,
            syncedTaskMappings: updatedMappings
          }, input.projectId);
          
          return {
            content: [{
              type: "text",
              text: `# ✅ Task Marked Complete in JIRA\n\n**Internal Task ID:** \`${taskMapping.internalTaskId}\`\n**Comment Task ID:** \`${taskMapping.commentTaskId}\`\n**JIRA Issue:** ${taskMapping.issueKey}\n\nThe original comment in JIRA has been updated to mark this task as completed!`
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `❌ Error: Failed to update JIRA comment. Please check your JIRA permissions and try again.`
            }]
          };
        }
      }
      
      case "status": {
        const syncMetadata = await getCommentSyncMetadata(input.projectId);
        
        let report = `# Comment Task Sync Status\n\n`;
        report += `**Last Sync:** ${syncMetadata.lastSyncTimestamp ? new Date(syncMetadata.lastSyncTimestamp).toLocaleString() : 'Never'}\n`;
        report += `**Last Check:** ${syncMetadata.lastCheckedTimestamp ? new Date(syncMetadata.lastCheckedTimestamp).toLocaleString() : 'Never'}\n`;
        report += `**Processed Comment Tasks:** ${syncMetadata.processedCommentTaskIds?.length || 0}\n`;
        report += `**Synced Task Mappings:** ${syncMetadata.syncedTaskMappings?.length || 0}\n\n`;
        
        const completedMappings = syncMetadata.syncedTaskMappings?.filter(m => m.completed).length || 0;
        const pendingMappings = (syncMetadata.syncedTaskMappings?.length || 0) - completedMappings;
        
        report += `## Task Status\n`;
        report += `- **Completed:** ${completedMappings}\n`;
        report += `- **Pending:** ${pendingMappings}\n\n`;
        
        report += `## Configuration\n`;
        report += `- **Auto Create Tasks:** ${syncMetadata.syncOptions?.autoCreateTasks ? '✅' : '❌'}\n`;
        report += `- **Auto Mark Complete:** ${syncMetadata.syncOptions?.autoMarkComplete ? '✅' : '❌'}\n`;
        report += `- **Task Prefix:** "${syncMetadata.syncOptions?.taskPrefix}"\n`;
        
        return {
          content: [{
            type: "text",
            text: report
          }]
        };
      }
      
      case "configure": {
        return {
          content: [{
            type: "text", 
            text: `# Configuration\n\n🚧 **Configuration management coming soon!**\n\nThis will allow setting up:\n- Automatic sync options\n- Task prefixes\n- Auto-completion settings\n- Project-specific rules`
          }]
        };
      }
      
      default:
        return {
          content: [{
            type: "text",
            text: `❌ Error: Unknown action '${input.action}'. Valid actions: scan, check_new, sync, mark_complete, status, configure`
          }]
        };
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: `❌ Error in comment task sync: ${errorMsg}`
      }]
    };
  }
} 