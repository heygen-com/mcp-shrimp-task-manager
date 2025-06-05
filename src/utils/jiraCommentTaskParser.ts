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
 * Parse a single JIRA comment for task patterns with enhanced UI context extraction
 */
export async function parseCommentForTasks(
  comment: JiraComment, 
  commentIndex: number = 0,
  options: { includeMedia?: boolean; baseUrl?: string; auth?: string } = {}
): Promise<CommentTaskParseResult> {
  appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Starting parse for comment ${comment.id || commentIndex}, author: ${comment.author?.displayName}`);
  
  const commentText = extractCommentText(comment.body);
  appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Extracted comment text length: ${commentText.length}`);
  appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Full comment text: "${commentText}"`);
  
  const tasks: EnhancedCommentTask[] = [];
  const lines = commentText.split('\n');
  appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Split into ${lines.length} lines`);
  
  // Extract media from ADF if available
  let media: CommentMedia[] = [];
  let downloadedImages: { id: string; base64Data: string; contentType: string; error?: string }[] = [];
  
  if (options.includeMedia && comment.body && typeof comment.body === 'object' && options.baseUrl) {
    media = extractMediaFromAdf(comment.body as AdfNode, options.baseUrl);
    appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Found ${media.length} media items`);
    
    // If media support is enabled and we have media, download the images
    if (options.includeMedia && media.length > 0 && options.auth) {
      appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Attempting to download ${media.length} images with auth`);
      downloadedImages = await downloadAuthenticatedImages(media, options.auth);
      appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Downloaded ${downloadedImages.filter(img => img.base64Data && !img.error).length}/${downloadedImages.length} images successfully`);
    } else {
      appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Skipping image downloads - includeMedia: ${options.includeMedia}, mediaCount: ${media.length}, hasAuth: ${!!options.auth}`);
    }
  }
  
  // Extract UI context hints from the entire comment
  const uiContext = extractUIContextHints(commentText);
  appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Extracted UI context - Pages: [${uiContext.pages.join(', ')}], Components: [${uiContext.components.join(', ')}], Actions: [${uiContext.actions.join(', ')}]`);
  
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
        
        // Create enhanced description with UI context
        let enhancedDescription = taskText;
        if (uiContext.pages.length > 0 || uiContext.components.length > 0 || uiContext.actions.length > 0) {
          const contextParts = [];
          if (uiContext.pages.length > 0) contextParts.push(`Pages: ${uiContext.pages.join(', ')}`);
          if (uiContext.components.length > 0) contextParts.push(`Components: ${uiContext.components.join(', ')}`);
          if (uiContext.actions.length > 0) contextParts.push(`Actions: ${uiContext.actions.join(', ')}`);
          enhancedDescription = `${taskText} | Context: ${contextParts.join(' | ')}`;
        }
        
        const task: EnhancedCommentTask = {
          id: commentTaskId,
          text: taskText,
          completed: isTaskCompleted(matches[0]),
          commentId: comment.id || `comment_${commentIndex}`,
          commentCreated: comment.created,
          author: comment.author?.displayName || comment.author?.emailAddress || 'Unknown',
          originalPattern: matches[0].trim(),
          lineNumber: lineIndex,
          contextText: getTaskContext(lines, lineIndex),
          media: media.length > 0 ? media : undefined,
          uiContext: {
            ...uiContext,
            enhancedDescription
          },
          downloadedImages: downloadedImages.length > 0 ? downloadedImages : undefined
        };
        
        appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Created enhanced task - ID: ${task.id}, text: "${task.text}", completed: ${task.completed}`);
        appendJiraCommentLog(`[DEBUG] parseCommentForTasks: Enhanced description: "${task.uiContext?.enhancedDescription}"`);
        
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
export async function parseCommentsForTasks(
  comments: JiraComment[], 
  options: { includeMedia?: boolean; baseUrl?: string; auth?: string } = {}
): Promise<CommentTaskParseResult> {
  appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Starting to parse ${comments.length} comments`);
  appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Options: includeMedia=${options.includeMedia}, baseUrl=${options.baseUrl}, hasAuth=${!!options.auth}`);
  
  const allTasks: CommentTask[] = [];
  
  for (let index = 0; index < comments.length; index++) {
    const comment = comments[index];
    appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Processing comment ${index + 1}/${comments.length}, ID: ${comment.id}`);
    appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Comment author: ${comment.author?.displayName}, created: ${comment.created}`);
    appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Comment body type: ${typeof comment.body}, has content: ${!!comment.body}`);
    
    const result = await parseCommentForTasks(comment, index, options);
    appendJiraCommentLog(`[DEBUG] parseCommentsForTasks: Comment ${index + 1} yielded ${result.tasks.length} tasks`);
    
    allTasks.push(...result.tasks);
  }
  
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
        const mediaId = mediaNode.attrs.id as string;
        const collection = mediaNode.attrs.collection as string;
        
        // Construct proper JIRA download URL - use attachment content endpoint
        let downloadUrl: string | undefined;
        if (mediaId) {
          if (collection) {
            // For media with collection, use the media endpoint
            downloadUrl = `${baseUrl}/rest/api/3/attachment/content/${mediaId}`;
          } else {
            // For regular attachments, use attachment endpoint  
            downloadUrl = `${baseUrl}/rest/api/3/attachment/content/${mediaId}`;
          }
        }
        
        const mediaItem: CommentMedia = {
          type: 'image',
          id: mediaId,
          url: mediaNode.attrs.url as string,
          alt: mediaNode.attrs.alt as string,
          width: mediaNode.attrs.width as number,
          height: mediaNode.attrs.height as number,
          collection: collection,
          downloadUrl: downloadUrl,
          filename: `image_${mediaId}.png` // Default filename
        };
        
        appendJiraCommentLog(`[DEBUG] extractMediaFromAdf: Found media - ID: ${mediaId}, collection: ${collection}, downloadUrl: ${downloadUrl}`);
        media.push(mediaItem);
      }
    }
    
    // Handle inline images with different formats
    if (adfNode.type === 'inlineCard' || adfNode.type === 'blockCard') {
      const url = adfNode.attrs?.url as string;
      if (url && (url.includes('/secure/attachment/') || url.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
        // Extract attachment ID from URL if possible
        const attachmentIdMatch = url.match(/\/attachment\/(\d+)\//);
        const attachmentId = attachmentIdMatch ? attachmentIdMatch[1] : 'unknown';
        
        media.push({
          type: 'image',
          id: attachmentId,
          url: url,
          downloadUrl: url.includes('/secure/attachment/') ? url : `${baseUrl}/rest/api/3/attachment/content/${attachmentId}`,
          description: 'Inline image or attachment'
        });
        
        appendJiraCommentLog(`[DEBUG] extractMediaFromAdf: Found inline media - URL: ${url}, extractedID: ${attachmentId}`);
      }
    }
    
    // Handle links that might be image attachments
    if (adfNode.marks) {
      for (const mark of adfNode.marks) {
        if (mark.type === 'link' && mark.attrs?.href) {
          const href = mark.attrs.href;
          if (href.includes('/secure/attachment/') || href.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            // Extract attachment ID from href if possible
            const attachmentIdMatch = href.match(/\/attachment\/(\d+)\//);
            const attachmentId = attachmentIdMatch ? attachmentIdMatch[1] : 'unknown';
            
            media.push({
              type: 'attachment',
              id: attachmentId,
              url: href,
              downloadUrl: href.includes('/secure/attachment/') ? href : `${baseUrl}/rest/api/3/attachment/content/${attachmentId}`,
              description: adfNode.text || 'Linked attachment'
            });
            
            appendJiraCommentLog(`[DEBUG] extractMediaFromAdf: Found linked media - href: ${href}, extractedID: ${attachmentId}`);
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
  appendJiraCommentLog(`[DEBUG] extractMediaFromAdf: Total media items extracted: ${media.length}`);
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
 * Download authenticated JIRA images and convert to base64
 */
async function downloadAuthenticatedImages(
  media: CommentMedia[], 
  auth?: string
): Promise<{ id: string; base64Data: string; contentType: string; error?: string }[]> {
  appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: Starting download process - media count: ${media.length}, hasAuth: ${!!auth}`);
  
  if (!auth || media.length === 0) {
    appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: Skipping downloads - auth: ${!!auth}, mediaCount: ${media.length}`);
    return [];
  }
  
  const downloadedImages = [];
  
  // Deduplicate media items by ID to avoid duplicate downloads
  const uniqueMedia = media.filter((item, index, self) => 
    index === self.findIndex(m => m.id === item.id)
  );
  
  appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: Deduplicated ${media.length} media items to ${uniqueMedia.length} unique items`);
  
  for (const mediaItem of uniqueMedia) {
    appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: Processing media item - ID: ${mediaItem.id}, downloadUrl: ${mediaItem.downloadUrl}`);
    
    if (mediaItem.downloadUrl && mediaItem.id) {
      let downloadSuccess = false;
      
      // Try multiple download strategies
      const downloadStrategies: Array<{ url: string; headers: Record<string, string>; name: string }> = [
        // Strategy 1: API endpoint with auth
        {
          url: mediaItem.downloadUrl,
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': '*/*',
            'User-Agent': 'MCP-Shrimp-TaskManager/1.0'
          },
          name: 'API with auth'
        },
        // Strategy 2: Browser-accessible URL (no auth needed for some JIRA instances)
        {
          url: mediaItem.downloadUrl.replace('/rest/api/3/attachment/content/', '/secure/attachment/'),
          headers: {
            'Accept': '*/*',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          },
          name: 'Secure attachment (no auth)'
        },
        // Strategy 3: Direct file URL if we can construct it
        {
          url: `${mediaItem.downloadUrl.split('/rest/')[0]}/secure/attachment/${mediaItem.id}/${mediaItem.filename || `attachment_${mediaItem.id}`}`,
          headers: {
            'Accept': '*/*',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          },
          name: 'Direct file URL'
        }
      ];
      
      for (const strategy of downloadStrategies) {
        if (downloadSuccess) break;
        
        try {
          appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: Trying ${strategy.name}: ${strategy.url}`);
          
          const response = await fetch(strategy.url, { headers: strategy.headers });
          
          appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: ${strategy.name} response: ${response.status}`);
          
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = response.headers.get('content-type') || 'image/png';
            const base64Data = `data:${contentType};base64,${buffer.toString('base64')}`;
            
            downloadedImages.push({
              id: mediaItem.id,
              base64Data,
              contentType
            });
            
            appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: ✅ Successfully downloaded with ${strategy.name}, size: ${buffer.length} bytes, contentType: ${contentType}`);
            downloadSuccess = true;
            break;
          } else {
            appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: ${strategy.name} failed: ${response.status}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: ${strategy.name} exception: ${errorMessage}`);
        }
      }
      
      if (!downloadSuccess) {
        downloadedImages.push({
          id: mediaItem.id,
          base64Data: '',
          contentType: '',
          error: `All download strategies failed (API auth, secure attachment, direct URL)`
        });
        
        appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: ❌ All download strategies failed for ${mediaItem.id}`);
      }
    } else {
      appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: ⚠️ No downloadUrl or ID for media item`);
    }
  }
  
  const successCount = downloadedImages.filter(img => img.base64Data && !img.error).length;
  appendJiraCommentLog(`[DEBUG] downloadAuthenticatedImages: ✅ Download process complete - successful: ${successCount}/${downloadedImages.length}`);
  return downloadedImages;
}

/**
 * Extract UI context hints from comment text for codebase correlation
 */
function extractUIContextHints(text: string): {
  pages: string[];
  components: string[];
  actions: string[];
  searchQueries: string[];
} {
  const pages: string[] = [];
  const components: string[] = [];
  const actions: string[] = [];
  const searchQueries: string[] = [];

  // Extract page mentions
  const pagePatterns = [
    /(?:on the |in the |from the )?(\w+)\s+page/gi,
    /(?:page|view|screen)[\s:]+(\w+)/gi
  ];
  
  pagePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const page = match[1].toLowerCase();
      if (page && !['this', 'that', 'the', 'a', 'an'].includes(page)) {
        pages.push(page);
        searchQueries.push(`${page} page`);
        searchQueries.push(`pages/${page}`);
      }
    }
  });

  // Extract component mentions
  const componentPatterns = [
    /(?:this |the |a )?(\w+)\s+(?:menu|button|dialog|modal|popup|dropdown|form|input|field)/gi,
    /(?:menu|button|dialog|modal|popup|dropdown|form|input|field)[\s:]+(\w+)/gi
  ];
  
  componentPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const component = match[1].toLowerCase();
      if (component && !['this', 'that', 'the', 'a', 'an'].includes(component)) {
        components.push(component);
        searchQueries.push(`${component} component`);
        searchQueries.push(`${component}Menu`);
        searchQueries.push(`${component}Button`);
      }
    }
  });

  // Extract action mentions (likely to be i18n keys)
  const actionPatterns = [
    /"([^"]+)" (?:option|button|link|text|label)/gi,
    /(?:localize|translate)\s+(?:the\s+)?["']?([^"'\n]+)["']?/gi,
    /(?:button|option|link|text|label)[\s:]+["']?([^"'\n]+)["']?/gi
  ];
  
  actionPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const action = match[1].trim();
      if (action && action.length > 2 && action.length < 50) {
        actions.push(action);
        // Generate common i18n key patterns
        const snakeCase = action.toLowerCase().replace(/\s+/g, '_');
        const camelCase = action.toLowerCase().replace(/\s+(.)/g, (_, letter) => letter.toUpperCase());
        searchQueries.push(action);
        searchQueries.push(snakeCase);
        searchQueries.push(camelCase);
        searchQueries.push(`"${action}"`);
      }
    }
  });

  return {
    pages: [...new Set(pages)],
    components: [...new Set(components)],
    actions: [...new Set(actions)],
    searchQueries: [...new Set(searchQueries)]
  };
}

/**
 * Enhanced CommentTask interface with UI context
 */
export interface EnhancedCommentTask extends CommentTask {
  uiContext?: {
    pages: string[];
    components: string[];
    actions: string[];
    searchQueries: string[];
    enhancedDescription?: string;
  };
  downloadedImages?: {
    id: string;
    base64Data: string;
    contentType: string;
    error?: string;
  }[];
} 