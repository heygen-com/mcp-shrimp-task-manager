import fsSync from 'fs';

const jiraToolLogPath = '/tmp/mcp_shrimp_jira_tool.log';

function appendJiraCommentLog(message: string) {
  const timestamp = new Date().toISOString();
  try {
    fsSync.appendFileSync(jiraToolLogPath, `${timestamp}: ${message}\n`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    // Can't console.log error here, it might break stdio
  }
}

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
    url?: string;        // For media/image nodes
    id?: string;         // For media/attachment IDs
    alt?: string;        // Alt text for images
    width?: number;      // Image dimensions
    height?: number;
    collection?: string; // Media collection
    occurrenceKey?: string; // Media occurrence key
    [key: string]: unknown;
  };
  marks?: Array<{
    type: string;
    attrs?: {
      href?: string;     // For links
      [key: string]: unknown;
    };
  }>;
}

// Interface for extracted media/images from comments
interface CommentMedia {
  type: 'image' | 'attachment' | 'embed';
  url?: string;
  id?: string;
  alt?: string;
  filename?: string;
  width?: number;
  height?: number;
  collection?: string;  // Media collection
  description?: string;
  downloadUrl?: string;  // Authenticated download URL
  [key: string]: unknown; // Allow additional properties like base64Data
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
  media?: CommentMedia[]; // Associated images/attachments
  contextText?: string; // Surrounding text for context
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
  appendJiraCommentLog(`[DEBUG] extractCommentText: Processing commentBody type: ${typeof commentBody}`);
  
  if (typeof commentBody === 'string') {
    appendJiraCommentLog(`[DEBUG] extractCommentText: String format, length: ${commentBody.length}, content: "${commentBody.substring(0, 100)}..."`);
    return commentBody;
  }
  
  // Handle ADF (Atlassian Document Format)
  if (commentBody?.type === 'doc' && commentBody?.content) {
    appendJiraCommentLog(`[DEBUG] extractCommentText: ADF format detected, content array length: ${commentBody.content.length}`);
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
        
        appendJiraCommentLog(`[DEBUG] extractCommentText: Found ADF taskItem - localId: ${localId}, state: ${state}`);
        
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
    appendJiraCommentLog(`[DEBUG] extractCommentText: ADF extracted text length: ${text.length}, content: "${text.substring(0, 200)}..."`);
    return text.trim();
  }
  
  appendJiraCommentLog(`[DEBUG] extractCommentText: Fallback to string conversion: "${String(commentBody || '').substring(0, 100)}..."`);
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
  commentIndex: number = 0,
  options: { includeMedia?: boolean; baseUrl?: string; auth?: string } = {}
): CommentTaskParseResult {
  appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Starting parse for comment ${comment.id || commentIndex}, author: ${comment.author?.displayName}`);
  
  const commentText = extractCommentText(comment.body);
  appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Extracted comment text length: ${commentText.length}`);
  appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Full comment text: "${commentText}"`);
  
  const tasks: CommentTask[] = [];
  const lines = commentText.split('\n');
  appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Split into ${lines.length} lines`);
  
  // Extract media from ADF if available
  let commentMedia: CommentMedia[] = [];
  if (options.includeMedia && comment.body && typeof comment.body === 'object' && options.baseUrl) {
    commentMedia = extractMediaFromAdf(comment.body as AdfNode, options.baseUrl);
    appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Found ${commentMedia.length} media items`);
  }
  
  lines.forEach((line, lineIndex) => {
    appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Processing line ${lineIndex}: "${line}"`);
    
    // Check each pattern against the line
    TASK_PATTERNS.forEach((pattern, patternIndex) => {
      // Reset pattern since we're using global flag
      pattern.lastIndex = 0;
      const matches = pattern.exec(line);
      
      if (matches && matches[1]) {
        appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Pattern ${patternIndex} matched on line ${lineIndex}. Match: "${matches[0]}", captured: "${matches[1]}"`);
        
        const taskText = cleanTaskText(matches[1]);
        appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Cleaned task text: "${taskText}"`);
        
        // Skip very short or generic text that's probably not a real task
        if (taskText.length < 5 || /^(yes|no|ok|done|etc)$/i.test(taskText)) {
          appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Skipping task - too short or generic: "${taskText}"`);
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
          lineNumber: lineIndex,
          contextText: getTaskContext(lines, lineIndex),
          media: commentMedia.length > 0 ? commentMedia : undefined
        };
        
        appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Created task - ID: ${task.id}, text: "${task.text}", completed: ${task.completed}`);
        tasks.push(task);
      } else {
        // Only log for first few patterns to avoid spam
        if (patternIndex < 3) {
          appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Pattern ${patternIndex} did not match line ${lineIndex}: "${line}"`);
        }
      }
    });
  });
  
  const completedTasks = tasks.filter(t => t.completed).length;
  const pendingTasks = tasks.filter(t => !t.completed).length;
  
  appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Final result - Total tasks: ${tasks.length}, completed: ${completedTasks}, pending: ${pendingTasks}`);
  
  return {
    tasks,
    hasTaskPatterns: tasks.length > 0,
    totalTasks: tasks.length,
    completedTasks,
    pendingTasks
  };
}

/**
 * Parse multiple JIRA comments for tasks with optional media support
 */
export function parseCommentsForTasks(
  comments: JiraComment[], 
  options: { includeMedia?: boolean; baseUrl?: string; auth?: string } = {}
): CommentTaskParseResult {
  appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Starting to parse ${comments.length} comments`);
  appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Options: includeMedia=${options.includeMedia}, baseUrl=${options.baseUrl}, hasAuth=${!!options.auth}`);
  
  const allTasks: CommentTask[] = [];
  
  comments.forEach((comment, index) => {
    appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Processing comment ${index + 1}/${comments.length}, ID: ${comment.id}`);
    appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Comment author: ${comment.author?.displayName}, created: ${comment.created}`);
    appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Comment body type: ${typeof comment.body}, has content: ${!!comment.body}`);
    
    const result = parseCommentForTasks(comment, index, options);
    appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Comment ${index + 1} yielded ${result.tasks.length} tasks`);
    
    allTasks.push(...result.tasks);
  });
  
  const completedTasks = allTasks.filter(t => t.completed).length;
  const pendingTasks = allTasks.filter(t => !t.completed).length;
  
  appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: FINAL RESULT - Total: ${allTasks.length}, completed: ${completedTasks}, pending: ${pendingTasks}`);
  
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

/**
 * Extract media nodes (images, attachments) from ADF content
 */
function extractMediaFromAdf(node: AdfNode, baseUrl: string): CommentMedia[] {
  const media: CommentMedia[] = [];
  
  function extractRecursive(adfNode: AdfNode) {
    // Handle media nodes (embedded images/attachments)
    if (adfNode.type === 'media' || adfNode.type === 'mediaSingle') {
      const mediaNode = adfNode.content?.[0] || adfNode;
      if (mediaNode.attrs) {
        const mediaItem: CommentMedia = {
          type: 'image',
          id: mediaNode.attrs.id as string,
          url: mediaNode.attrs.url as string,
          alt: mediaNode.attrs.alt as string,
          width: mediaNode.attrs.width as number,
          height: mediaNode.attrs.height as number,
          collection: mediaNode.attrs.collection as string,
          downloadUrl: mediaNode.attrs.url ? `${baseUrl}/secure/attachment/${mediaNode.attrs.id}` : undefined,
          filename: `image_${mediaNode.attrs.id}.png` // Default filename
        };
        media.push(mediaItem);
      }
    }
    
    // Handle inline images with different formats
    if (adfNode.type === 'inlineCard' || adfNode.type === 'blockCard') {
      const url = adfNode.attrs?.url as string;
      if (url && (url.includes('/secure/attachment/') || url.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
        media.push({
          type: 'image',
          url: url,
          downloadUrl: url,
          description: 'Inline image or attachment'
        });
      }
    }
    
    // Handle links that might be image attachments
    if (adfNode.marks) {
      for (const mark of adfNode.marks) {
        if (mark.type === 'link' && mark.attrs?.href) {
          const href = mark.attrs.href;
          if (href.includes('/secure/attachment/') || href.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            media.push({
              type: 'attachment',
              url: href,
              downloadUrl: href,
              description: adfNode.text || 'Linked attachment'
            });
          }
        }
      }
    }
    
    // Recurse through content
    if (adfNode.content) {
      adfNode.content.forEach(extractRecursive);
    }
  }
  
  extractRecursive(node);
  return media;
}

/**
 * Get surrounding context text for a task (helpful for image association)
 */
function getTaskContext(lines: string[], taskLineIndex: number, contextLines: number = 2): string {
  const start = Math.max(0, taskLineIndex - contextLines);
  const end = Math.min(lines.length, taskLineIndex + contextLines + 1);
  return lines.slice(start, end).join('\n');
}

/**
 * Download and encode image as base64 for agent consumption
 */
export async function downloadImageAsBase64(url: string, auth?: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'image/*'
    };
    
    if (auth) {
      headers['Authorization'] = `Basic ${auth}`;
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      appendJiraCommentLog(`Failed to download image from ${url}: ${response.status}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';
    
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    appendJiraCommentLog(`Error downloading image from ${url}: ${errorMessage}`);
    return null;
  }
} 