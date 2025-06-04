// Define interfaces for JIRA comment structures
interface JiraComment {
  id?: string;
  author?: {
    displayName?: string;
    emailAddress?: string;
  };
  body?: AdfNode | string;
  created: string;
}

// Define ADF Node interface for proper typing
interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  attrs?: {
    state?: string;
    localId?: string;
    [key: string]: unknown;
  };
}

export interface CommentTask {
  id: string; // Unique identifier for this comment task
  text: string; // The actual task text
  completed: boolean; // Whether the task is marked as completed
  commentId: string; // JIRA comment ID this task came from
  commentCreated: string; // When the comment was created
  author: string; // Who created the comment
  originalPattern: string; // Original text pattern that was detected
  lineNumber?: number; // Which line in the comment this task was found
}

export interface CommentTaskParseResult {
  tasks: CommentTask[];
  hasTaskPatterns: boolean;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
}

// Regex patterns for detecting different task formats
const TASK_PATTERNS = [
  // Markdown-style checkboxes
  /^[\s]*[-*+]\s*\[[\sx]\]\s*(.+)$/gim,
  // Unicode checkboxes  
  /^[\s]*[☐☑✓✗]\s*(.+)$/gim,
  // TODO patterns
  /^[\s]*TODO:\s*(.+)$/gim,
  /^[\s]*@?TODO\s+(.+)$/gim,
  // Action item patterns
  /^[\s]*ACTION:\s*(.+)$/gim,
  /^[\s]*TASK:\s*(.+)$/gim,
  // Numbered action lists (be careful not to catch general numbered lists)
  /^[\s]*\d+\.\s*((?:implement|add|fix|update|create|remove|refactor|test|validate|check|ensure|configure)\s+.+)$/gim,
];

/**
 * Extract text content from JIRA comment body (handles both string and ADF format)
 */
export function extractCommentText(commentBody: string | AdfNode | undefined): string {
  if (typeof commentBody === 'string') {
    return commentBody;
  }
  
  // Handle ADF (Atlassian Document Format)
  if (commentBody?.type === 'doc' && commentBody?.content) {
    let text = '';
    
    function extractTextRecursive(node: AdfNode) {
      if (node.type === 'text') {
        text += node.text;
      }
      
      // Handle JIRA native task items
      if (node.type === 'taskItem') {
        const state = node.attrs?.state || 'TODO';
        const localId = node.attrs?.localId || '';
        const isCompleted = state === 'DONE';
        const checkbox = isCompleted ? '[x]' : '[ ]';
        
        // Add the task as a checkbox format that our parser can understand
        text += `\n- ${checkbox} `;
        
        // Extract the task text from content
        if (node.content) {
          node.content.forEach(extractTextRecursive);
        }
        
        // Add metadata comment for ADF tasks
        text += ` <!-- ADF-TASK:${localId}:${state} -->`;
      }
      
      if (node.content) {
        node.content.forEach(extractTextRecursive);
      }
      if (node.type === 'paragraph') {
        text += '\n';
      }
      if (node.type === 'listItem') {
        text += '\n- ';
      }
    }
    
    commentBody.content.forEach(extractTextRecursive);
    return text.trim();
  }
  
  return String(commentBody || '');
}

/**
 * Generate a unique ID for a comment task
 */
function generateCommentTaskId(commentId: string, lineNumber: number, text: string, originalPattern?: string): string {
  // Check if this is an ADF task with a localId
  const adfMatch = originalPattern?.match(/<!-- ADF-TASK:([^:]+):/);
  if (adfMatch) {
    return `adf_${commentId}_${adfMatch[1]}`;
  }
  
  // Create a short hash from the text to ensure uniqueness within the comment
  const textHash = text.toLowerCase().replace(/\s+/g, '').slice(0, 8);
  return `ct_${commentId}_${lineNumber}_${textHash}`;
}

/**
 * Determine if a task pattern indicates completion
 */
function isTaskCompleted(originalPattern: string): boolean {
  const completedMarkers = [
    /\[x\]/i,
    /☑/,
    /✓/,
    /✗/,
    /\[✓\]/,
    /\[✗\]/
  ];
  
  return completedMarkers.some(pattern => pattern.test(originalPattern));
}

/**
 * Clean and normalize task text
 */
function cleanTaskText(text: string): string {
  return text
    .trim()
    .replace(/^(TODO:|ACTION:|TASK:)/i, '') // Remove prefixes
    .replace(/\[[\sx✓✗]\]/g, '') // Remove checkbox markers
    .replace(/[☐☑✓✗]/g, '') // Remove unicode markers
    .replace(/^\d+\.\s*/, '') // Remove numbered list markers
    .trim();
}

/**
 * Parse a single JIRA comment for task patterns
 */
export function parseCommentForTasks(
  comment: JiraComment, 
  commentIndex: number = 0
): CommentTaskParseResult {
  const commentText = extractCommentText(comment.body);
  const tasks: CommentTask[] = [];
  const lines = commentText.split('\n');
  
  lines.forEach((line, lineIndex) => {
    // Check each pattern against the line
    TASK_PATTERNS.forEach(pattern => {
      // Reset pattern since we're using global flag
      pattern.lastIndex = 0;
      const matches = pattern.exec(line);
      
      if (matches && matches[1]) {
        const taskText = cleanTaskText(matches[1]);
        
        // Skip very short or generic text that's probably not a real task
        if (taskText.length < 5 || /^(yes|no|ok|done|etc)$/i.test(taskText)) {
          return;
        }
        
        const commentTaskId = generateCommentTaskId(
          comment.id || `comment_${commentIndex}`, 
          lineIndex, 
          taskText,
          matches[0]
        );
        
        const task: CommentTask = {
          id: commentTaskId,
          text: taskText,
          completed: isTaskCompleted(matches[0]),
          commentId: comment.id || `comment_${commentIndex}`,
          commentCreated: comment.created,
          author: comment.author?.displayName || comment.author?.emailAddress || 'Unknown',
          originalPattern: matches[0].trim(),
          lineNumber: lineIndex
        };
        
        tasks.push(task);
      }
    });
  });
  
  const completedTasks = tasks.filter(t => t.completed).length;
  const pendingTasks = tasks.filter(t => !t.completed).length;
  
  return {
    tasks,
    hasTaskPatterns: tasks.length > 0,
    totalTasks: tasks.length,
    completedTasks,
    pendingTasks
  };
}

/**
 * Parse multiple JIRA comments for tasks
 */
export function parseCommentsForTasks(comments: JiraComment[]): CommentTaskParseResult {
  const allTasks: CommentTask[] = [];
  
  comments.forEach((comment, index) => {
    const result = parseCommentForTasks(comment, index);
    allTasks.push(...result.tasks);
  });
  
  const completedTasks = allTasks.filter(t => t.completed).length;
  const pendingTasks = allTasks.filter(t => !t.completed).length;
  
  return {
    tasks: allTasks,
    hasTaskPatterns: allTasks.length > 0,
    totalTasks: allTasks.length,
    completedTasks,
    pendingTasks
  };
}

/**
 * Filter for new tasks since last processing
 */
export function filterNewTasks(
  allTasks: CommentTask[], 
  lastProcessedCommentId?: string,
  lastProcessedTimestamp?: string,
  processedTaskIds: Set<string> = new Set()
): CommentTask[] {
  return allTasks.filter(task => {
    // Skip if we've already processed this specific task
    if (processedTaskIds.has(task.id)) {
      return false;
    }
    
    // If we have a timestamp cutoff, only include tasks from comments after that time
    if (lastProcessedTimestamp) {
      const taskCommentTime = new Date(task.commentCreated).getTime();
      const cutoffTime = new Date(lastProcessedTimestamp).getTime();
      return taskCommentTime > cutoffTime;
    }
    
    return true;
  });
}

/**
 * Generate markdown representation of comment tasks for review
 */
export function formatCommentTasksAsMarkdown(result: CommentTaskParseResult): string {
  if (!result.hasTaskPatterns) {
    return '## 📝 No actionable tasks found in comments\n\nNo checkbox patterns, TODOs, or action items detected.';
  }
  
  let md = `## 📋 Comment Tasks Summary\n\n`;
  md += `**Total Tasks:** ${result.totalTasks} | **Pending:** ${result.pendingTasks} | **Completed:** ${result.completedTasks}\n\n`;
  
  // Group by completion status
  const pendingTasks = result.tasks.filter(t => !t.completed);
  const completedTasks = result.tasks.filter(t => t.completed);
  
  if (pendingTasks.length > 0) {
    md += `### 🔄 Pending Tasks (${pendingTasks.length})\n\n`;
    pendingTasks.forEach((task, index) => {
      md += `${index + 1}. **${task.text}**\n`;
      md += `   - *Author:* ${task.author}\n`;
      md += `   - *Comment Date:* ${new Date(task.commentCreated).toLocaleString()}\n`;
      md += `   - *Pattern:* \`${task.originalPattern}\`\n\n`;
    });
  }
  
  if (completedTasks.length > 0) {
    md += `### ✅ Completed Tasks (${completedTasks.length})\n\n`;
    completedTasks.forEach((task, index) => {
      md += `${index + 1}. ~~${task.text}~~\n`;
      md += `   - *Author:* ${task.author}\n`;
      md += `   - *Completed in comment from:* ${new Date(task.commentCreated).toLocaleString()}\n\n`;
    });
  }
  
  return md;
} 