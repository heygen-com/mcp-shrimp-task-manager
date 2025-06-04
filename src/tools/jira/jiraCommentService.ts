import "dotenv/config";
import fetch from "node-fetch";
import { z } from "zod";
import { getJiraCredentials } from "../../utils/jiraCredentials.js";

// Interfaces for JIRA Comment CRUD operations
export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls?: {
    '48x48'?: string;
  };
}

export interface AdfNode {
  type: string;
  version?: number;
  text?: string;
  content?: AdfNode[];
  attrs?: {
    state?: string;
    localId?: string;
    [key: string]: unknown;
  };
}

export interface JiraComment {
  id?: string;
  author?: JiraUser;
  body?: AdfNode | string; // ADF or string
  created: string;
  updated?: string;
  updateAuthor?: JiraUser;
  visibility?: {
    type: string;
    value: string;
  };
}

export interface JiraCommentCreateRequest {
  body: AdfNode | string;
  visibility?: {
    type: string; // "group" or "role"
    value: string; // group name or role name
  };
}

export interface JiraCommentUpdateRequest {
  body: AdfNode | string;
  visibility?: {
    type: string;
    value: string;
  };
}

export interface JiraCommentResponse {
  success: boolean;
  data?: JiraComment;
  error?: string;
  details?: unknown;
}

export interface JiraCommentsListResponse {
  success: boolean;
  data?: {
    comments: JiraComment[];
    maxResults: number;
    total: number;
    startAt: number;
  };
  error?: string;
  details?: unknown;
}

export interface JiraCommentListRequest {
  // Time-based filters
  since?: string; // ISO date string - comments created since this time
  until?: string; // ISO date string - comments created until this time
  lastMinutes?: number; // Comments from last X minutes
  lastHours?: number; // Comments from last X hours
  lastDays?: number; // Comments from last X days
  
  // Author filters
  authorAccountId?: string; // Filter by specific author account ID
  authorDisplayName?: string; // Filter by author display name (fuzzy match)
  authorEmail?: string; // Filter by author email
  
  // Content filters
  textSearch?: string; // Search within comment text content
  
  // Pagination and sorting
  startAt?: number; // Starting index for pagination
  maxResults?: number; // Maximum results to return (default: 50, max: 1000)
  orderBy?: 'created' | '-created' | 'updated' | '-updated'; // Sort order
  
  // Additional options
  expand?: string[]; // Fields to expand
  includeDeleted?: boolean; // Include deleted comments (if accessible)
}

export interface JiraCommentListResponse {
  success: boolean;
  data?: {
    comments: JiraComment[];
    total: number;
    filtered: number; // Number after client-side filtering
    startAt: number;
    maxResults: number;
    filters: {
      applied: string[];
      timeRange?: { since?: string; until?: string; };
      author?: string;
      textSearch?: string;
    };
  };
  error?: string;
  details?: unknown;
}

// Validation schemas
export const CreateCommentSchema = z.object({
  issueKey: z.string().min(1, "Issue key is required"),
  body: z.union([z.string(), z.record(z.any())]).describe("Comment body in text or ADF format"),
  visibility: z.object({
    type: z.enum(["group", "role"]),
    value: z.string()
  }).optional().describe("Comment visibility restrictions")
});

export const UpdateCommentSchema = z.object({
  issueKey: z.string().min(1, "Issue key is required"),
  commentId: z.string().min(1, "Comment ID is required"),
  body: z.union([z.string(), z.record(z.any())]).describe("Updated comment body in text or ADF format"),
  visibility: z.object({
    type: z.enum(["group", "role"]),
    value: z.string()
  }).optional().describe("Updated comment visibility restrictions")
});

export const ReadCommentSchema = z.object({
  issueKey: z.string().min(1, "Issue key is required"),
  commentId: z.string().min(1, "Comment ID is required").optional(),
  expand: z.array(z.string()).optional().describe("Additional fields to expand")
});

export const DeleteCommentSchema = z.object({
  issueKey: z.string().min(1, "Issue key is required"),
  commentId: z.string().min(1, "Comment ID is required")
});

// Validation schema for list operation
export const ListCommentsSchema = z.object({
  issueKey: z.string().min(1, "Issue key is required"),
  since: z.string().optional().describe("ISO date string - comments since this time"),
  until: z.string().optional().describe("ISO date string - comments until this time"),
  lastMinutes: z.number().min(1).optional().describe("Comments from last X minutes"),
  lastHours: z.number().min(1).optional().describe("Comments from last X hours"),
  lastDays: z.number().min(1).optional().describe("Comments from last X days"),
  authorAccountId: z.string().optional().describe("Filter by author account ID"),
  authorDisplayName: z.string().optional().describe("Filter by author display name"),
  authorEmail: z.string().optional().describe("Filter by author email"),
  textSearch: z.string().optional().describe("Search within comment text"),
  startAt: z.number().min(0).optional().describe("Starting index for pagination"),
  maxResults: z.number().min(1).max(1000).optional().describe("Maximum results (1-1000)"),
  orderBy: z.enum(['created', '-created', 'updated', '-updated']).optional().describe("Sort order"),
  expand: z.array(z.string()).optional().describe("Fields to expand"),
  includeDeleted: z.boolean().optional().describe("Include deleted comments")
});

// Helper to get JIRA credentials from env
function getJiraEnv() {
  return getJiraCredentials();
}

// Helper to convert plain text to Atlassian Document Format (ADF)
function toADF(text: string): AdfNode {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text }
        ]
      }
    ]
  };
}

// Helper to create interactive ADF task list
function createAdfTaskList(tasks: Array<{ text: string; completed?: boolean; id?: string }>): AdfNode {
  const taskItems = tasks.map((task, index) => ({
    type: "taskItem",
    attrs: {
      localId: task.id || `task-${Date.now()}-${index}`,
      state: task.completed ? "DONE" : "TODO"
    },
    content: [
      {
        type: "text",
        text: task.text
      }
    ]
  }));

  return {
    type: "taskList",
    attrs: {
      localId: `tasklist-${Date.now()}`
    },
    content: taskItems
  };
}

// Helper to create ADF document with task list
function createAdfWithTaskList(
  introText: string,
  tasks: Array<{ text: string; completed?: boolean; id?: string }>,
  followupText?: string
): AdfNode {
  const content: AdfNode[] = [];
  
  // Add intro paragraph if provided
  if (introText.trim()) {
    content.push({
      type: "paragraph",
      content: [{ type: "text", text: introText }]
    });
  }
  
  // Add task list
  content.push(createAdfTaskList(tasks));
  
  // Add followup paragraph if provided
  if (followupText?.trim()) {
    content.push({
      type: "paragraph", 
      content: [{ type: "text", text: followupText }]
    });
  }
  
  return {
    type: "doc",
    version: 1,
    content
  };
}

// Helper to parse text and detect task lists for ADF conversion
function parseTextForTasks(text: string): {
  hasTaskList: boolean;
  adfContent?: AdfNode;
  plainText: string;
} {
  const lines = text.split('\n');
  const tasks: Array<{ text: string; completed: boolean; lineIndex: number }> = [];
  const nonTaskLines: string[] = [];
  
  lines.forEach((line, index) => {
    let isTask = false;
    
    // Check checkbox format [ ] or [x]
    const checkboxMatch = line.match(/^[ ]*[-*+]?[ ]*\[([x ])\][ ]*(.*?)$/i);
    if (checkboxMatch) {
      tasks.push({
        text: checkboxMatch[2].trim(),
        completed: checkboxMatch[1].toLowerCase() === 'x',
        lineIndex: index
      });
      isTask = true;
    }
    
    // Check numbered list format
    else {
      const numberedMatch = line.match(/^[ ]*\d+\.[ ]*(.*?)$/);
      if (numberedMatch && numberedMatch[1].trim()) {
        tasks.push({
          text: numberedMatch[1].trim(),
          completed: false,
          lineIndex: index
        });
        isTask = true;
      }
    }
    
    // Check action-oriented format (- implement, - add, etc.)
    if (!isTask) {
      const actionMatch = line.match(/^[ ]*[-*+][ ]+((?:implement|add|fix|update|create|remove|refactor|test|validate|check|ensure|configure)\s+.*)$/i);
      if (actionMatch) {
        tasks.push({
          text: actionMatch[1].trim(),
          completed: false,
          lineIndex: index
        });
        isTask = true;
      }
    }
    
    if (!isTask) {
      nonTaskLines.push(line);
    }
  });
  
  if (tasks.length === 0) {
    return {
      hasTaskList: false,
      plainText: text
    };
  }
  
  // Create ADF with task list
  const introText = nonTaskLines.slice(0, tasks[0]?.lineIndex || 0).join('\n').trim();
  const followupText = nonTaskLines.slice(tasks[tasks.length - 1]?.lineIndex || 0).join('\n').trim();
  
  const adfTasks = tasks.map((task, index) => ({
    text: task.text,
    completed: task.completed,
    id: `task-${Date.now()}-${index}`
  }));
  
  return {
    hasTaskList: true,
    adfContent: createAdfWithTaskList(introText, adfTasks, followupText),
    plainText: text
  };
}

// Helper to extract text from ADF
function extractTextFromAdf(node: AdfNode): string {
  let text = "";
  
  if (node.type === "text" && node.text) {
    text += node.text;
  }
  
  if (node.content) {
    for (const childNode of node.content) {
      text += extractTextFromAdf(childNode);
    }
  }
  
  if (node.type === "paragraph" || node.type === "heading") {
    text += "\n";
  }
  
  return text;
}

/**
 * JIRA Comment Service - Unified CRUD operations for JIRA comments
 */
export class JiraCommentService {
  private baseUrl: string;
  private email: string;
  private apiToken: string;
  private auth: string;

  constructor() {
    const { baseUrl, email, apiToken } = getJiraEnv();
    this.baseUrl = baseUrl;
    this.email = email;
    this.apiToken = apiToken;
    this.auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  }

  /**
   * Create a new comment on a JIRA issue
   */
  async createComment(issueKey: string, request: JiraCommentCreateRequest): Promise<JiraCommentResponse> {
    try {
      CreateCommentSchema.parse({ issueKey, ...request });
      
      const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
      
      // Convert plain text to ADF if needed, with smart task list detection
      let body = request.body;
      if (typeof body === "string") {
        const taskParseResult = parseTextForTasks(body);
        if (taskParseResult.hasTaskList && taskParseResult.adfContent) {
          body = taskParseResult.adfContent;
        } else {
          body = toADF(body);
        }
      }
      
      const payload = {
        body,
        ...(request.visibility && { visibility: request.visibility })
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${this.auth}`,
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `JIRA API error: ${response.status} ${response.statusText}`,
          details: errorText
        };
      }

      const data = await response.json() as JiraComment;
      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Helper method to create interactive task list comment
   */
  createTaskListComment(tasks: Array<{ text: string; completed?: boolean; id?: string }>, introText?: string, followupText?: string): AdfNode {
    return createAdfWithTaskList(introText || "", tasks, followupText);
  }

  /**
   * Helper method to parse text and detect task lists
   */
  parseTextForTasks(text: string) {
    return parseTextForTasks(text);
  }

  /**
   * Read comment(s) from a JIRA issue
   */
  async readComments(issueKey: string, commentId?: string, expand?: string[]): Promise<JiraCommentResponse | JiraCommentsListResponse> {
    try {
      ReadCommentSchema.parse({ issueKey, commentId, expand });
      
      if (commentId) {
        // Read specific comment
        const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment/${commentId}`;
        const expandParam = expand ? `?expand=${expand.join(',')}` : '';
        
        const response = await fetch(`${url}${expandParam}`, {
          method: "GET",
          headers: {
            "Authorization": `Basic ${this.auth}`,
            "Accept": "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            error: `JIRA API error: ${response.status} ${response.statusText}`,
            details: errorText
          };
        }

        const data = await response.json() as JiraComment;
        return {
          success: true,
          data
        };
      } else {
        // Read all comments
        const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
        const expandParam = expand ? `?expand=${expand.join(',')}` : '';
        
        const response = await fetch(`${url}${expandParam}`, {
          method: "GET",
          headers: {
            "Authorization": `Basic ${this.auth}`,
            "Accept": "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            error: `JIRA API error: ${response.status} ${response.statusText}`,
            details: errorText
          };
        }

        const data = await response.json() as {
          comments: JiraComment[];
          maxResults: number;
          total: number;
          startAt: number;
        };
        
        return {
          success: true,
          data
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Update an existing comment on a JIRA issue
   */
  async updateComment(issueKey: string, commentId: string, request: JiraCommentUpdateRequest): Promise<JiraCommentResponse> {
    try {
      UpdateCommentSchema.parse({ issueKey, commentId, ...request });
      
      const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment/${commentId}`;
      
      // Convert plain text to ADF if needed
      let body = request.body;
      if (typeof body === "string") {
        body = toADF(body);
      }
      
      const payload = {
        body,
        ...(request.visibility && { visibility: request.visibility })
      };

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": `Basic ${this.auth}`,
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `JIRA API error: ${response.status} ${response.statusText}`,
          details: errorText
        };
      }

      const data = await response.json() as JiraComment;
      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Delete a comment from a JIRA issue
   */
  async deleteComment(issueKey: string, commentId: string): Promise<JiraCommentResponse> {
    try {
      DeleteCommentSchema.parse({ issueKey, commentId });
      
      const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment/${commentId}`;
      
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Authorization": `Basic ${this.auth}`,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `JIRA API error: ${response.status} ${response.statusText}`,
          details: errorText
        };
      }

      // DELETE typically returns 204 No Content on success
      return {
        success: true,
        data: {
          id: commentId,
          created: new Date().toISOString()
        } as JiraComment
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Helper method to format comment data for display
   */
  formatCommentForDisplay(comment: JiraComment): string {
    let markdown = `## Comment ${comment.id}\n\n`;
    markdown += `**Author:** ${comment.author?.displayName || 'Unknown'}\n`;
    markdown += `**Created:** ${new Date(comment.created).toLocaleString()}\n`;
    
    if (comment.updated && comment.updated !== comment.created) {
      markdown += `**Updated:** ${new Date(comment.updated).toLocaleString()}`;
      if (comment.updateAuthor) {
        markdown += ` by ${comment.updateAuthor.displayName}`;
      }
      markdown += '\n';
    }
    
    if (comment.visibility) {
      markdown += `**Visibility:** ${comment.visibility.type} - ${comment.visibility.value}\n`;
    }
    
    markdown += '\n**Content:**\n';
    
    if (typeof comment.body === 'string') {
      markdown += `> ${comment.body.replace(/\n/g, '\n> ')}\n`;
    } else if (comment.body && typeof comment.body === 'object') {
      const textContent = extractTextFromAdf(comment.body);
      markdown += `> ${textContent.trim().replace(/\n/g, '\n> ')}\n`;
    } else {
      markdown += '> [No content]\n';
    }
    
    return markdown;
  }

  /**
   * Helper method to get comment URL
   */
  getCommentUrl(issueKey: string, commentId: string): string {
    return `${this.baseUrl}/browse/${issueKey}?focusedCommentId=${commentId}`;
  }

  /**
   * List comments with filtering, searching, and pagination
   */
  async listComments(issueKey: string, request: JiraCommentListRequest = {}): Promise<JiraCommentListResponse> {
    try {
      ListCommentsSchema.parse({ issueKey, ...request });
      
      // Prepare API parameters
      const startAt = request.startAt || 0;
      const maxResults = Math.min(request.maxResults || 50, 1000);
      const orderBy = request.orderBy || 'created';
      const expand = request.expand ? request.expand.join(',') : '';
      
      // Build URL with query parameters
      const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
      const params = new URLSearchParams({
        startAt: startAt.toString(),
        maxResults: maxResults.toString(),
        orderBy: orderBy,
        ...(expand && { expand })
      });
      
      const response = await fetch(`${url}?${params}`, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${this.auth}`,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `JIRA API error: ${response.status} ${response.statusText}`,
          details: errorText
        };
      }

      const data = await response.json() as {
        comments: JiraComment[];
        maxResults: number;
        total: number;
        startAt: number;
      };
      
      // Apply client-side filters
      let filteredComments = [...data.comments];
      const appliedFilters: string[] = [];
      const timeRange: { since?: string; until?: string; } = {};
      
      // Time-based filtering
      if (request.lastMinutes) {
        const cutoff = new Date(Date.now() - request.lastMinutes * 60 * 1000);
        filteredComments = filteredComments.filter(comment => 
          new Date(comment.created) >= cutoff
        );
        appliedFilters.push(`Last ${request.lastMinutes} minutes`);
        timeRange.since = cutoff.toISOString();
      } else if (request.lastHours) {
        const cutoff = new Date(Date.now() - request.lastHours * 60 * 60 * 1000);
        filteredComments = filteredComments.filter(comment => 
          new Date(comment.created) >= cutoff
        );
        appliedFilters.push(`Last ${request.lastHours} hours`);
        timeRange.since = cutoff.toISOString();
      } else if (request.lastDays) {
        const cutoff = new Date(Date.now() - request.lastDays * 24 * 60 * 60 * 1000);
        filteredComments = filteredComments.filter(comment => 
          new Date(comment.created) >= cutoff
        );
        appliedFilters.push(`Last ${request.lastDays} days`);
        timeRange.since = cutoff.toISOString();
      } else {
        // Custom date range
        if (request.since) {
          const sinceDate = new Date(request.since);
          filteredComments = filteredComments.filter(comment => 
            new Date(comment.created) >= sinceDate
          );
          appliedFilters.push(`Since ${sinceDate.toLocaleString()}`);
          timeRange.since = request.since;
        }
        
        if (request.until) {
          const untilDate = new Date(request.until);
          filteredComments = filteredComments.filter(comment => 
            new Date(comment.created) <= untilDate
          );
          appliedFilters.push(`Until ${untilDate.toLocaleString()}`);
          timeRange.until = request.until;
        }
      }
      
      // Author filtering
      let authorFilter: string | undefined;
      if (request.authorAccountId) {
        filteredComments = filteredComments.filter(comment => 
          comment.author?.accountId === request.authorAccountId
        );
        appliedFilters.push(`Author ID: ${request.authorAccountId}`);
        authorFilter = request.authorAccountId;
      } else if (request.authorDisplayName) {
        const searchName = request.authorDisplayName.toLowerCase();
        filteredComments = filteredComments.filter(comment => 
          comment.author?.displayName?.toLowerCase().includes(searchName)
        );
        appliedFilters.push(`Author: ${request.authorDisplayName}`);
        authorFilter = request.authorDisplayName;
      } else if (request.authorEmail) {
        filteredComments = filteredComments.filter(comment => 
          comment.author?.emailAddress === request.authorEmail
        );
        appliedFilters.push(`Author email: ${request.authorEmail}`);
        authorFilter = request.authorEmail;
      }
      
      // Text search filtering
      let textSearchFilter: string | undefined;
      if (request.textSearch) {
        const searchText = request.textSearch.toLowerCase();
        filteredComments = filteredComments.filter(comment => {
          let commentText = '';
          
          if (typeof comment.body === 'string') {
            commentText = comment.body.toLowerCase();
          } else if (comment.body && typeof comment.body === 'object') {
            commentText = extractTextFromAdf(comment.body).toLowerCase();
          }
          
          return commentText.includes(searchText);
        });
        appliedFilters.push(`Text search: "${request.textSearch}"`);
        textSearchFilter = request.textSearch;
      }
      
      return {
        success: true,
        data: {
          comments: filteredComments,
          total: data.total,
          filtered: filteredComments.length,
          startAt: data.startAt,
          maxResults: data.maxResults,
          filters: {
            applied: appliedFilters,
            ...(Object.keys(timeRange).length > 0 && { timeRange }),
            ...(authorFilter && { author: authorFilter }),
            ...(textSearchFilter && { textSearch: textSearchFilter })
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Helper method to format comment list for display
   */
  formatCommentListForDisplay(listData: JiraCommentListResponse['data'], issueKey: string): string {
    if (!listData) return 'No data available';
    
    let markdown = `# Comment List for ${issueKey}\n\n`;
    
    // Summary
    markdown += `**Total comments in issue:** ${listData.total}\n`;
    markdown += `**Returned by API:** ${listData.comments.length}\n`;
    if (listData.filtered !== listData.comments.length) {
      markdown += `**After filtering:** ${listData.filtered}\n`;
    }
    markdown += `**Page:** ${Math.floor(listData.startAt / listData.maxResults) + 1}\n`;
    
    // Applied filters
    if (listData.filters.applied.length > 0) {
      markdown += `\n**Applied Filters:**\n`;
      listData.filters.applied.forEach(filter => {
        markdown += `- ${filter}\n`;
      });
    }
    
    // Comments
    if (listData.comments.length === 0) {
      markdown += `\n*No comments match the specified criteria.*\n`;
    } else {
      markdown += `\n## Comments\n\n`;
      
      listData.comments.forEach((comment, index) => {
        markdown += `### ${index + 1}. Comment ${comment.id}\n\n`;
        markdown += `**Author:** ${comment.author?.displayName || 'Unknown'}\n`;
        markdown += `**Created:** ${new Date(comment.created).toLocaleString()}\n`;
        
        if (comment.updated && comment.updated !== comment.created) {
          markdown += `**Updated:** ${new Date(comment.updated).toLocaleString()}`;
          if (comment.updateAuthor) {
            markdown += ` by ${comment.updateAuthor.displayName}`;
          }
          markdown += '\n';
        }
        
        if (comment.visibility) {
          markdown += `**Visibility:** ${comment.visibility.type} - ${comment.visibility.value}\n`;
        }
        
        markdown += '\n**Content:**\n';
        if (typeof comment.body === 'string') {
          const preview = comment.body.length > 150 
            ? comment.body.substring(0, 150) + '...' 
            : comment.body;
          markdown += `> ${preview.replace(/\n/g, '\n> ')}\n`;
        } else if (comment.body && typeof comment.body === 'object') {
          const textContent = extractTextFromAdf(comment.body);
          const preview = textContent.length > 150 
            ? textContent.substring(0, 150) + '...' 
            : textContent;
          markdown += `> ${preview.trim().replace(/\n/g, '\n> ')}\n`;
        } else {
          markdown += '> [No content]\n';
        }
        
        markdown += '\n---\n\n';
      });
    }
    
    // Pagination info
    if (listData.total > listData.maxResults) {
      const currentPage = Math.floor(listData.startAt / listData.maxResults) + 1;
      const totalPages = Math.ceil(listData.total / listData.maxResults);
      markdown += `\n*Showing page ${currentPage} of ${totalPages}. Use startAt and maxResults parameters for pagination.*\n`;
    }
    
    return markdown;
  }
}

// Export helper functions for agents to use directly
export { createAdfTaskList, createAdfWithTaskList, parseTextForTasks };

// Export a singleton instance
export const jiraCommentService = new JiraCommentService();