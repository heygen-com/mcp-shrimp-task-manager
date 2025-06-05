import "dotenv/config";
import { z } from "zod";
import fetch from "node-fetch";
import * as fs from "fs/promises";
import fsSync from 'fs';
import path from "path";
import { 
  parseCommentsForTasks, 
  EnhancedCommentTask
} from "../utils/jiraCommentTaskParser.js";
import { 
  jiraCommentService, 
  JiraCommentCreateRequest, 
  JiraCommentUpdateRequest 
} from "./jira/jiraCommentService.js";
import { getJiraCredentials, getCredentialSource } from "../utils/jiraCredentials.js";

// Basic JIRA Interfaces for improved type safety
interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls?: {
    '48x48'?: string;
  };
}

// Simplified ADF Node interface for text extraction
interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  attrs?: {
    state?: string;
    localId?: string;
    [key: string]: unknown;
  };
  // attrs?: any; // Could be further specified if needed
  // marks?: any[]; // Could be further specified if needed
}

interface JiraComment {
  id?: string;
  author?: JiraUser;
  body?: AdfNode | string; // ADF or string
  created: string;
}

interface JiraAttachment {
  filename: string;
  content: string; // URL to the attachment
  size: number;
}

// More specific type for JIRA Issue Link Type
interface JiraIssueLinkType {
  name?: string;
  outwardDesc?: string;
  inwardDesc?: string;
  // Allow other string-indexed properties for dynamic access like [direction + "Desc"]
  [key: string]: string | undefined;
}

// More specific type for JIRA Issue Links
interface JiraIssueLink {
  type?: JiraIssueLinkType;
  outwardIssue?: { key: string; fields?: { summary?: string } };
  inwardIssue?: { key: string; fields?: { summary?: string } };
}

interface BasicJiraTicketFields {
  summary?: string;
  status?: { name?: string };
  issuetype?: { name?: string };
  project?: { key?: string; name?: string };
  priority?: { name?: string };
  reporter?: JiraUser;
  assignee?: JiraUser;
  created?: string;
  updated?: string;
  labels?: string[];
  description?: AdfNode | string; // ADF or string
  subtasks?: Array<{ key: string; fields?: { summary?: string; status?: { name?: string } } }>;
  issuelinks?: JiraIssueLink[]; // Use the more specific type
  comment?: { comments?: JiraComment[] };
  attachment?: JiraAttachment[];
}

interface BasicJiraTicket {
  key: string;
  fields: BasicJiraTicketFields;
  id?: string;
  self?: string;
}

// Interfaces for JIRA Changelog
interface JiraChangelogItem {
  field: string; // e.g., "status", "assignee", "Summary"
  fieldtype: string; // e.g., "jira", "custom"
  fieldId?: string; // e.g., "status", "assignee", "summary"
  from: string | null; // Old value ID (e.g., status ID, user key)
  fromString: string | null; // Old value display string
  to: string | null; // New value ID
  toString: string | null; // New value display string
}

interface JiraChangelogEntry {
  id: string;
  author: JiraUser; // Re-use JiraUser interface
  created: string; // Timestamp of the change
  items: JiraChangelogItem[];
  historyMetadata?: Record<string, unknown>; // For additional metadata if present
}

export interface JiraChangelog {
  startAt: number;
  maxResults: number;
  total: number;
  values: JiraChangelogEntry[]; // This is the array of actual history events
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const weeks = Math.round(days / 7);
  const months = Math.round(days / 30.44); // Average days in month
  const years = Math.round(days / 365.25); // Account for leap year

  if (seconds < 60) return `${seconds} seconds ago`;
  if (minutes < 60) return minutes === 1 ? `1 minute ago` : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? `1 hour ago` : `${hours} hours ago`;
  if (days < 7) return days === 1 ? `1 day ago` : `${days} days ago`;
  if (weeks < 5) return weeks === 1 ? `1 week ago` : `${weeks} weeks ago`; // Up to 4 weeks
  if (months < 12) return months === 1 ? `1 month ago` : `${months} months ago`;
  return years === 1 ? `1 year ago` : `${years} years ago`;
}

const jiraToolLogPath = '/tmp/mcp_shrimp_jira_tool.log';

function appendJiraToolLog(message: string) {
  const timestamp = new Date().toISOString();
  try {
    fsSync.appendFileSync(jiraToolLogPath, `${timestamp}: ${message}\n`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    // Can't console.log error here, it might break stdio
  }
}

// Zod schema for the JIRA tool input
export const JiraToolSchema = z.object({
  action: z.enum(["create", "update", "read", "find", "list", "sync", "verify_credentials", "find_user", "history", "get_comment_tasks", "update_comment_task", "delete", "create_comment", "read_comments", "update_comment", "delete_comment", "list_comments"]),
  domain: z.enum(["ticket", "project", "component", "migration", "user"]),
  context: z.object({
    projectKey: z.string().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    labels: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    issueType: z.string().optional(), // Add support for issue type
    issueKey: z.string().optional(), // Added for finding specific ticket
    assigneeAccountId: z.string().optional(), // For assigning tickets
    assignee: z.string().optional(), // For providing username/email for assignment lookup
    userQuery: z.string().optional(), // Explicit field for user search query
    taskId: z.string().optional(), // For comment task operations
    completed: z.boolean().optional(), // For marking comment tasks complete
    // Comment-specific fields
    commentId: z.string().optional(), // For targeting specific comments
    body: z.union([z.string(), z.record(z.any())]).optional(), // Comment body content
    visibility: z.object({
      type: z.enum(["group", "role"]),
      value: z.string()
    }).optional(), // Comment visibility restrictions
    expand: z.array(z.string()).optional(), // Fields to expand in response
    // Comment list/search fields
    since: z.string().optional(), // ISO date string - comments since this time
    until: z.string().optional(), // ISO date string - comments until this time
    lastMinutes: z.number().optional(), // Comments from last X minutes
    lastHours: z.number().optional(), // Comments from last X hours
    lastDays: z.number().optional(), // Comments from last X days
    authorAccountId: z.string().optional(), // Filter by author account ID
    authorDisplayName: z.string().optional(), // Filter by author display name
    authorEmail: z.string().optional(), // Filter by author email
    textSearch: z.string().optional(), // Search within comment text
    startAt: z.number().optional(), // Starting index for pagination
    maxResults: z.number().optional(), // Maximum results to return
    orderBy: z.enum(['created', '-created', 'updated', '-updated']).optional(), // Sort order
    includeDeleted: z.boolean().optional(), // Include deleted comments
    // Add more fields as needed for extensibility
  }).passthrough(), // Allow other fields for specific actions if needed
  options: z.object({
    // fetchExactMatch is no longer needed for a dedicated 'read' action for specific tickets.
    // It might be repurposed if 'find' evolves to support more complex queries.
    fetchExactMatch: z.boolean().optional(), // Flag to fetch a single specific ticket
    page: z.number().optional(),
    limit: z.number().optional(),
  }).passthrough().optional(), // For future extensibility
});

// Typescript type for convenience
export type JiraToolInput = z.infer<typeof JiraToolSchema>;

// Main handler for the JIRA tool
type JiraToolResult = {
  markdown: string;
  json: unknown;
  url?: string;
};

// Helper to get JIRA credentials from env
function getJiraEnv() {
  const credentials = getJiraCredentials();
  const source = getCredentialSource();
  
  appendJiraToolLog(`[INFO] getJiraEnv: ${source.details}`);
  
  return {
    baseUrl: credentials.baseUrl,
    email: credentials.email,
    apiToken: credentials.apiToken
  };
}

// Helper to get project data dir
function getProjectDataDir(projectKey: string) {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dataDir, "projects", projectKey);
}

// Helper to get path to jira-tickets.json
function getJiraTicketsPath(projectKey: string) {
  return path.join(getProjectDataDir(projectKey), "jira-tickets.json");
}

// Helper to read local JIRA tickets
async function readLocalJiraTickets(projectKey: string): Promise<unknown[]> {
  const filePath = getJiraTicketsPath(projectKey);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Helper to write local JIRA tickets
async function writeLocalJiraTickets(projectKey: string, tickets: unknown[]): Promise<void> {
  const filePath = getJiraTicketsPath(projectKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(tickets, null, 2));
}

// Helper to convert plain text to Atlassian Document Format (ADF)
function toADF(text: string, metadata?: Record<string, unknown>): unknown {
  const content = [
    {
      type: "paragraph",
      content: [
        { type: "text", text }
      ]
    }
  ];
  if (metadata) {
    content.push({
      type: "paragraph",
      content: [
        { type: "text", text: `<!-- SHRIMP-METADATA: ${JSON.stringify(metadata)} -->` }
      ]
    });
  }
  return {
    type: "doc",
    version: 1,
    content
  };
}

// Helper to create a JIRA ticket via API
async function createJiraTicket(input: JiraToolInput): Promise<unknown> {
  const { baseUrl, email, apiToken } = getJiraEnv();
  const { projectKey, summary, description, labels, metadata } = input.context;
  const url = `${baseUrl}/rest/api/3/issue`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const body = {
    fields: {
      project: { key: projectKey },
      summary: summary || "No summary provided",
      description: toADF(description || "No description provided", metadata),
      issuetype: { name: "Task" },
      labels: labels || [],
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`JIRA API error: ${res.status} ${errorText}`);
  }
  return await res.json();
}

// Helper to find JIRA tickets assigned to the current user, optionally filtered by project
async function findAssignedTickets(projectKey?: string): Promise<Record<string, unknown>[]> {
  const { baseUrl, email, apiToken } = getJiraEnv();
  const url = `${baseUrl}/rest/api/3/search`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  // JQL: all issues assigned to current user, optionally filtered by project
  const jql = projectKey && projectKey !== ''
    ? `project = ${projectKey} AND assignee = currentUser() ORDER BY created DESC`
    : `assignee = currentUser() ORDER BY created DESC`;
  const res = await fetch(`${url}?jql=${encodeURIComponent(jql)}&fields=key,summary,status,project`, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`JIRA API error: ${res.status} ${errorText}`);
  }
  const data = await res.json() as { issues: Record<string, unknown>[] };
  return data.issues.map(issue => ({
    key: issue.key,
    summary: (issue.fields as Record<string, unknown>).summary,
    status: (issue.fields as Record<string, unknown>).status && ((issue.fields as Record<string, unknown>).status as Record<string, unknown>).name,
    url: `${baseUrl}/browse/${issue.key}`,
    project: (issue.fields as Record<string, unknown>).project && ((issue.fields as Record<string, unknown>).project as Record<string, unknown>).key
  }));
}

// Helper to verify JIRA API credentials by calling /myself
async function verifyJiraApiCredentials(): Promise<{ success: boolean; data: unknown; message: string }> {
  appendJiraToolLog("[INFO] verifyJiraApiCredentials: Attempting to verify.");
  try {
    const { baseUrl, email, apiToken } = getJiraEnv();
    const myselfUrl = `${baseUrl}/rest/api/3/myself`;
    appendJiraToolLog(`[INFO] verifyJiraApiCredentials: Calling URL: ${myselfUrl}`);
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

    const response = await fetch(myselfUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    });

    const responseStatus = response.status;
    const responseData = await response.json();
    appendJiraToolLog(`[INFO] verifyJiraApiCredentials: Received status ${responseStatus}. Data: ${JSON.stringify(responseData).substring(0, 100)}...`);

    if (response.ok) {
      return { success: true, data: responseData, message: "Credentials are valid. User details fetched." };
    } else {
      return { success: false, data: responseData, message: `API Error ${responseStatus} ${response.statusText}. Credentials may be incorrect or lack permissions.` };
    }
  } catch (error) {
    let errorMessage = "Failed to verify JIRA credentials due to a script error.";
    if (error instanceof Error) {
      errorMessage = error.message;
      if (error.cause && typeof error.cause === 'object' && 'code' in error.cause && error.cause.code === 'ENOTFOUND') {
        errorMessage += ` (Network Hint: Could not resolve JIRA_BASE_URL: ${process.env.JIRA_BASE_URL})`;
      }
    }
    appendJiraToolLog(`[ERROR] verifyJiraApiCredentials: Exception - ${errorMessage}`);
    return { success: false, data: { error: errorMessage }, message: errorMessage };
  }
}

// Helper to list all JIRA projects
async function listJiraProjects(): Promise<Record<string, unknown>[]> {
  const { baseUrl, email, apiToken } = getJiraEnv();
  const url = `${baseUrl}/rest/api/3/project`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
    },
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`JIRA API error: ${res.status} ${errorText}`);
  }
  
  const projects = await res.json() as Record<string, unknown>[];
  return projects.map(project => ({
    key: project.key,
    name: project.name,
    id: project.id,
    projectTypeKey: project.projectTypeKey,
    lead: (project.lead as Record<string, unknown>)?.displayName || 'Unknown'
  }));
}

// Helper to create a JIRA epic
async function createJiraEpic(input: JiraToolInput): Promise<unknown> {
  const { baseUrl, email, apiToken } = getJiraEnv();
  const { projectKey, summary, description, labels, metadata } = input.context;
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  
  // First, get the project details to obtain the internal ID
  const projectUrl = `${baseUrl}/rest/api/3/project/${projectKey}`;
  const projectRes = await fetch(projectUrl, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
    },
  });
  
  if (!projectRes.ok) {
    const errorText = await projectRes.text();
    throw new Error(`Failed to get project details: ${projectRes.status} ${errorText}`);
  }
  
  const projectData = await projectRes.json() as Record<string, unknown>;
  const projectId = projectData.id as string;
  
  // Now get the epic issue type ID for this project using the internal ID
  const issueTypesUrl = `${baseUrl}/rest/api/3/issuetype/project?projectId=${projectId}`;
  
  const issueTypesRes = await fetch(issueTypesUrl, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
    },
  });
  
  if (!issueTypesRes.ok) {
    throw new Error(`Failed to get issue types: ${issueTypesRes.status}`);
  }
  
  const issueTypes = await issueTypesRes.json() as Record<string, unknown>[];
  const epicType = issueTypes.find((type) => {
    const typeName = (type as Record<string, unknown>).name as string;
    const hierarchyLevel = (type as Record<string, unknown>).hierarchyLevel as number;
    return typeName.toLowerCase() === 'epic' || hierarchyLevel === 1;
  });
  
  if (!epicType) {
    throw new Error(`Epic issue type not found for project ${projectKey}`);
  }
  
  // Create the epic with enhanced description including project ID
  let enhancedDescription = description || "No description provided";
  if (metadata?.projectId) {
    enhancedDescription += `\n\n---\nLinked Project ID: ${metadata.projectId}`;
  }
  
  // Add project ID to labels
  const enhancedLabels = [...(labels || [])];
  if (metadata?.projectId) {
    enhancedLabels.push(`project-${metadata.projectId}`);
  }
  
  const url = `${baseUrl}/rest/api/3/issue`;
  const body = {
    fields: {
      project: { key: projectKey },
      summary: summary || "No summary provided",
      description: toADF(enhancedDescription, metadata),
      issuetype: { id: (epicType as Record<string, unknown>).id as string },
      labels: enhancedLabels,
    },
  };
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`JIRA API error: ${res.status} ${errorText}`);
  }
  
  return await res.json();
}

// Helper to update JIRA issue labels
export async function updateJiraIssueLabels(issueKey: string, newLabels: string[]): Promise<void> {
  const { baseUrl, email, apiToken } = getJiraEnv();
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  
  // First, get the current issue to retrieve existing labels
  const issueUrl = `${baseUrl}/rest/api/3/issue/${issueKey}?fields=labels`;
  const getRes = await fetch(issueUrl, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
    },
  });
  
  if (!getRes.ok) {
    const errorText = await getRes.text();
    throw new Error(`Failed to get issue ${issueKey}: ${getRes.status} ${errorText}`);
  }
  
  const issueData = await getRes.json() as Record<string, unknown>;
  const fields = issueData.fields as Record<string, unknown>;
  const existingLabels = (fields.labels || []) as string[];
  
  // Merge existing and new labels, removing duplicates
  const allLabels = Array.from(new Set([...existingLabels, ...newLabels]));
  
  // Update the issue with the new labels
  const updateUrl = `${baseUrl}/rest/api/3/issue/${issueKey}`;
  const updateBody = {
    fields: {
      labels: allLabels
    }
  };
  
  const updateRes = await fetch(updateUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateBody),
  });
  
  if (!updateRes.ok) {
    const errorText = await updateRes.text();
    throw new Error(`Failed to update issue ${issueKey}: ${updateRes.status} ${errorText}`);
  }
  
  appendJiraToolLog(`[INFO] updateJiraIssueLabels: Successfully updated labels for ${issueKey}. Labels: ${allLabels.join(', ')}`);
}

// Helper to find a JIRA user by query (username, displayName, or email)
async function findJiraUser(query: string): Promise<JiraUser | null> {
  appendJiraToolLog(`[INFO] findJiraUser: Attempting to find user with query: ${query}`);
  const { baseUrl, email, apiToken } = getJiraEnv();
  const encodedQuery = encodeURIComponent(query);
  const url = `${baseUrl}/rest/api/3/user/search?query=${encodedQuery}`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

  appendJiraToolLog(`[INFO] findJiraUser: Fetching URL: ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    appendJiraToolLog(`[ERROR] findJiraUser: JIRA API error searching for user '${query}': ${res.status} ${errorText}`);
    return null; 
  }
  
  const users = await res.json() as JiraUser[]; 
  if (users && users.length > 0) {
    if (users.length === 1) {
      appendJiraToolLog(`[INFO] findJiraUser: Found 1 user for query '${query}': ${users[0].accountId} - ${users[0].displayName}`);
      return users[0]; 
    } else {
      appendJiraToolLog(`[WARN] findJiraUser: Found ${users.length} users for query '${query}'. Returning the first one. Consider more specific query or handling multiple results.`);
      return users[0]; 
    }
  } else {
    appendJiraToolLog(`[INFO] findJiraUser: No user found for query '${query}'.`);
    return null;
  }
}

// Helper to fetch a single JIRA ticket by its key with all fields
async function getJiraTicketByKey(issueKey: string): Promise<BasicJiraTicket> {
  appendJiraToolLog(`[INFO] getJiraTicketByKey: Attempting to fetch details for issue: ${issueKey}`);
  const { baseUrl, email, apiToken } = getJiraEnv();
  // Explicitly expand comments to ensure they're returned
  const url = `${baseUrl}/rest/api/3/issue/${issueKey}?fields=*all&expand=comments`; 
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

  appendJiraToolLog(`[INFO] getJiraTicketByKey: Fetching URL: ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    appendJiraToolLog(`[ERROR] getJiraTicketByKey: JIRA API error for ${issueKey}: ${res.status} ${errorText}`);
    throw new Error(`JIRA API error fetching ${issueKey}: ${res.status} ${errorText}`);
  }
  
  const ticketData = await res.json() as BasicJiraTicket;
  
  // Log detailed comment information for debugging
  const commentCount = ticketData.fields?.comment?.comments?.length || 0;
  appendJiraToolLog(`[INFO] getJiraTicketByKey: Successfully fetched details for ${issueKey}. Data size: ${JSON.stringify(ticketData).length}, Comments found: ${commentCount}`);
  
  if (commentCount > 0) {
    appendJiraToolLog(`[INFO] getJiraTicketByKey: Comment details - ${ticketData.fields?.comment?.comments?.map(c => `ID:${c.id}, Author:${c.author?.displayName}, Created:${c.created}`).join('; ')}`);
  } else {
    appendJiraToolLog(`[WARN] getJiraTicketByKey: No comments found in API response for ${issueKey}. Comment field structure: ${JSON.stringify(ticketData.fields?.comment || 'undefined')}`);
  }
  
  return ticketData;
}

// Helper to format JIRA ticket JSON to Markdown
function formatJiraTicketToMarkdown(ticketData: BasicJiraTicket): string {
  if (!ticketData || !ticketData.key || !ticketData.fields) {
    return "# Invalid JIRA Ticket Data\n\nCould not format ticket details due to missing key information.";
  }

  const fields = ticketData.fields;
  const baseUrl = getJiraEnv().baseUrl; 
  const ticketUrl = `${baseUrl}/browse/${ticketData.key}`;

  let md = `# JIRA Ticket: [${ticketData.key}](${ticketUrl})\n\n`;

  md += `**Summary:** ${fields.summary || "N/A"}\n`;
  md += `**Status:** ${fields.status?.name || "N/A"}\n`;
  md += `**Type:** ${fields.issuetype?.name || "N/A"}\n`;
  md += `**Project:** ${fields.project?.key || "N/A"} (${fields.project?.name || "N/A"})\n`;
  md += `**Priority:** ${fields.priority?.name || "N/A"}\n`;
  md += `**Reporter:** ${fields.reporter?.displayName || "N/A"} ${fields.reporter?.emailAddress ? `(${fields.reporter.emailAddress})` : ''}\n`;
  md += `**Assignee:** ${fields.assignee?.displayName || "Unassigned"} ${fields.assignee?.emailAddress ? `(${fields.assignee.emailAddress})` : ''}\n`;
  md += `**Created:** ${fields.created ? new Date(fields.created).toLocaleString() : "N/A"}\n`;
  md += `**Updated:** ${fields.updated ? new Date(fields.updated).toLocaleString() : "N/A"}\n`;

  if (fields.labels && fields.labels.length > 0) {
    md += `**Labels:** ${fields.labels.join(", ")}\n`;
  }

  md += "\n## Description\n";
  if (fields.description) {
    if (typeof fields.description === 'string') {
      md += `${fields.description}\n`;
    } else if (fields.description.type === 'doc' && fields.description.content) {
      let descText = "";
      function extractTextFromAdf(node: AdfNode) {
        if (node.type === 'text') {
          descText += node.text;
        }
        if (node.content) {
          node.content.forEach(extractTextFromAdf);
        }
        if (node.type === 'paragraph') { 
          descText += '\n';
        }
      }
      fields.description.content.forEach(extractTextFromAdf);
      md += descText.trim() ? descText.trim() + '\n' : "No description provided.\n";
    } else {
      md += "Description not in a recognizable format.\n";
    }
  } else {
    md += "No description provided.\n";
  }

  if (fields.subtasks && fields.subtasks.length > 0) {
    md += "\n## Sub-tasks\n";
    fields.subtasks.forEach((subtask) => {
      md += `- [${subtask.key}](${baseUrl}/browse/${subtask.key}): ${subtask.fields?.summary || 'N/A'} (${subtask.fields?.status?.name || 'N/A'})\n`;
    });
  }

  if (fields.issuelinks && fields.issuelinks.length > 0) {
    md += "\n## Linked Issues\n";
    const epicLinkType = fields.issuelinks.find((link) => link.type?.name === "Epic-Story Link" && link.inwardIssue);
    if (epicLinkType && epicLinkType.inwardIssue) {
      const epic = epicLinkType.inwardIssue;
      md += `**Epic:** [${epic.key}](${baseUrl}/browse/${epic.key}) - ${epic.fields?.summary || 'N/A'}\n`;
    }
    fields.issuelinks.forEach((link: JiraIssueLink) => {
      if (link.type?.name !== "Epic-Story Link") {
        const direction = link.outwardIssue ? "outward" : "inward";
        const issue = link.outwardIssue || link.inwardIssue;
        if (issue && link.type) {
          const descKey = direction + "Desc";
          md += `- ${link.type[descKey] || link.type.name}: [${issue.key}](${baseUrl}/browse/${issue.key}) - ${issue.fields?.summary || 'N/A'}\n`;
        }
      }
    });
  }
  
  if (fields.comment && fields.comment.comments && fields.comment.comments.length > 0) {
    md += "\n## Comments\n";
    const comments = fields.comment.comments;
    const recentComments = comments.slice(-3); 
    recentComments.forEach((comment: JiraComment) => {
      md += `\n**${comment.author?.displayName || "User"}** (${new Date(comment.created).toLocaleString()}):\n`;
      if (typeof comment.body === 'string') {
        md += `> ${comment.body.replace(/\n/g, '\n>')}\n`; 
      } else if (comment.body?.type === 'doc' && comment.body?.content) {
        let commentText = "";
        function extractTextFromAdfComment(node: AdfNode) {
          if (node.type === 'text') commentText += node.text;
          if (node.content) node.content.forEach(extractTextFromAdfComment);
          if (node.type === 'paragraph') commentText += '\n';
        }
        comment.body.content.forEach(extractTextFromAdfComment);
        md += `> ${commentText.trim().replace(/\n/g, '\n>')}\n`;
      } else {
        md += "> Comment not in a recognizable format.\n";
      }
    });
  }

  if (fields.attachment && fields.attachment.length > 0) {
    md += "\n## Attachments\n";
    fields.attachment.forEach((att: JiraAttachment) => {
      md += `- [${att.filename}](${att.content}) (${(att.size / 1024).toFixed(2)} KB)\n`;
    });
  }

  md += `\n---\n[View full ticket in JIRA](${ticketUrl})\n`;
  return md;
}

// Helper to update a JIRA ticket via API
async function updateJiraTicket(issueKey: string, updatePayload: Record<string, unknown>): Promise<boolean> {
  appendJiraToolLog(`[INFO] updateJiraTicket: Attempting to update issue: ${issueKey} with payload: ${JSON.stringify(updatePayload)}`);
  const { baseUrl, email, apiToken } = getJiraEnv();
  const url = `${baseUrl}/rest/api/3/issue/${issueKey}`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updatePayload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    appendJiraToolLog(`[ERROR] updateJiraTicket: JIRA API error updating ${issueKey}: ${res.status} ${errorText}`);
    throw new Error(`JIRA API error updating ${issueKey}: ${res.status} - ${errorText}`);
  }
  
  // Typically, a successful PUT for update returns 204 No Content
  appendJiraToolLog(`[INFO] updateJiraTicket: Successfully updated issue ${issueKey}. Status: ${res.status}`);
  return true; 
}

// Helper to fetch the changelog/history for a JIRA ticket
async function getJiraTicketHistory(issueKey: string, page: number = 1, limit: number = 100): Promise<JiraChangelog> {
  appendJiraToolLog(`[INFO] getJiraTicketHistory: Attempting to fetch changelog for issue: ${issueKey}, page: ${page}, limit: ${limit}`);
  const { baseUrl, email, apiToken } = getJiraEnv();
  const startAt = (page - 1) * limit;
  const url = `${baseUrl}/rest/api/3/issue/${issueKey}/changelog?startAt=${startAt}&maxResults=${limit}`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

  appendJiraToolLog(`[INFO] getJiraTicketHistory: Fetching URL: ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    appendJiraToolLog(`[ERROR] getJiraTicketHistory: JIRA API error fetching changelog for '${issueKey}': ${res.status} ${errorText}`);
    throw new Error(`JIRA API error fetching changelog for ${issueKey}: ${res.status} ${errorText}`);
  }
  
  const changelogData = await res.json() as JiraChangelog; 
  appendJiraToolLog(`[INFO] getJiraTicketHistory: Successfully fetched changelog page for ${issueKey}. Found ${changelogData.values?.length || 0} items.`);
  return changelogData; 
}

export function formatChangelogToTimelineMarkdown(issueKey: string, changelog: JiraChangelog, newEntryIds?: Set<string>): string {
  if (!changelog || !changelog.values || changelog.values.length === 0) {
    return `No history found for JIRA ticket [${issueKey}](${getJiraEnv().baseUrl}/browse/${issueKey}).`;
  }

  let md = `# Change Log for JIRA Ticket [${issueKey}](${getJiraEnv().baseUrl}/browse/${issueKey})\n\n`;

  const sortedEntries = [...changelog.values].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

  for (const entry of sortedEntries) {
    const authorName = entry.author?.displayName || "Unknown User";
    const relativeTime = timeAgo(entry.created);
    const isNew = newEntryIds?.has(entry.id);

    for (const item of entry.items) {
      let from = item.fromString || item.from || "nothing";
      let to = item.toString || item.to || "something";
      const fieldName = item.field;

      // Sanitize and simplify display for certain fields
      if (fieldName.toLowerCase() === "description" || fieldName.toLowerCase() === "summary" || fieldName.toLowerCase().includes("comment")) {
        if (from && from.length > 70) from = from.substring(0, 70) + "...";
        if (to && to.length > 70) to = to.substring(0, 70) + "...";
      }
      
      md += isNew ? "🆕 " : "- ";
      if (item.field.toLowerCase() === "attachment" && item.fromString === null) {
        md += `Added attachment: **${to}**\n`;
      } else if (item.field.toLowerCase() === "attachment" && item.toString === null) {
        md += `Removed attachment: **${from}**\n`;
      } else if (item.field.toLowerCase() === "sprint" && item.fromString && item.toString) {
        md += `Changed **${fieldName}** from _some sprint(s)_ to _other sprint(s)_\n`;
      } else if (item.field.toLowerCase().includes("rank")) {
        md += `Changed **${fieldName}** (Ranked higher/lower)\n`;
      } else {
        md += `Changed **${fieldName}** from _${from}_ to _${to}_\n`;
      }
      md += `  *By ${authorName}, ${relativeTime}*\n\n`; 
    }
  }

  if (changelog.total > changelog.values.length) {
    md += `\n*Displaying ${changelog.values.length} of ${changelog.total} history entries. Use options.page and options.limit to paginate.*\n`;
  }

  return md;
}

export async function jiraToolHandler(input: JiraToolInput): Promise<JiraToolResult> {
  appendJiraToolLog(`[INFO] jiraToolHandler: Received action: ${input.action}, domain: ${input.domain}, context: ${JSON.stringify(input.context).substring(0,100)}...`);

  // Handle other domains
  switch (input.action) {
    case "create":
      if (input.domain === "ticket") {
        const { projectKey, summary, metadata, issueType } = input.context;
        
        // If issueType is epic, use the epic creation function
        if (issueType === 'epic') {
          const epicRes = await createJiraEpic(input) as Record<string, unknown>;
          const epicKey = epicRes.key as string;
          const epicUrl = `${process.env.JIRA_BASE_URL}/browse/${epicKey}`;
          
          return {
            markdown: `# Epic Created\n\nSummary: ${summary}\n\n[View in JIRA](${epicUrl})`,
            json: {
              key: epicKey,
              url: epicUrl,
              summary: summary,
              description: input.context.description,
              labels: input.context.labels,
              metadata: input.context.metadata,
              type: 'epic'
            },
            url: epicUrl,
          };
        }
        
        // Otherwise, create a regular task
        // 1. Check if ticket already exists (by summary/metadata)
        const localTickets = await readLocalJiraTickets(projectKey || "") as Record<string, unknown>[];
        const exists = localTickets.find(t =>
          (t.summary as string | undefined) === summary &&
          JSON.stringify(t.metadata) === JSON.stringify(metadata)
        );
        if (exists) {
          return {
            markdown: `# Ticket Already Exists\n\nSummary: ${exists.summary as string}\n\n[View in JIRA](${exists.url as string})`,
            json: exists,
            url: exists.url as string,
          };
        }
        // 2. Create ticket via JIRA API
        const jiraRes = await createJiraTicket(input) as Record<string, unknown>;
        const ticketKey = jiraRes.key as string;
        const ticketUrl = `${process.env.JIRA_BASE_URL}/browse/${ticketKey}`;
        // 3. Store metadata in local file
        const newTicket = {
          key: ticketKey,
          url: ticketUrl,
          summary: input.context.summary,
          description: input.context.description,
          labels: input.context.labels,
          metadata: input.context.metadata,
          created: jiraRes.fields && (jiraRes.fields as Record<string, unknown>).created,
        };
        localTickets.push(newTicket);
        await writeLocalJiraTickets(projectKey || "", localTickets);
        // 4. Return markdown, JSON, and URL
        return {
          markdown: `# Ticket Created\n\nSummary: ${newTicket.summary}\n\n[View in JIRA](${newTicket.url})`,
          json: newTicket,
          url: newTicket.url,
        };
      }
      break;
    case "create_comment": {
      if (input.domain === "ticket") {
        const { issueKey, body, visibility } = input.context;
        
        if (!issueKey) {
          appendJiraToolLog("[ERROR] jiraToolHandler (create_comment): issueKey is required.");
          return {
            markdown: "❌ Error: issueKey is required for comment operations.",
            json: { error: "issueKey is required" },
          };
        }

        if (!body) {
          appendJiraToolLog("[ERROR] jiraToolHandler (create_comment): body is required.");
          return {
            markdown: "❌ Error: body is required to create a comment.",
            json: { error: "body is required" },
          };
        }

        appendJiraToolLog(`[INFO] jiraToolHandler (create_comment): Creating comment for issue: ${issueKey}`);
        
        const request: JiraCommentCreateRequest = {
          body: body as string | AdfNode,
          ...(visibility && { visibility })
        };

        const result = await jiraCommentService.createComment(issueKey, request);
        
        if (result.success && result.data) {
          const markdown = jiraCommentService.formatCommentForDisplay(result.data);
          return {
            markdown: `# ✅ Comment Created Successfully\n\n${markdown}`,
            json: result.data,
            url: jiraCommentService.getCommentUrl(issueKey, result.data.id || "")
          };
        } else {
          return {
            markdown: `❌ Error creating comment: ${result.error}`,
            json: { error: result.error, details: result.details }
          };
        }
      }
      break;
    }

    case "read_comments": {
      if (input.domain === "ticket") {
        const { issueKey, commentId, expand } = input.context;
        
        if (!issueKey) {
          appendJiraToolLog("[ERROR] jiraToolHandler (read_comments): issueKey is required.");
          return {
            markdown: "❌ Error: issueKey is required for comment operations.",
            json: { error: "issueKey is required" },
          };
        }

        appendJiraToolLog(`[INFO] jiraToolHandler (read_comments): Reading comments for issue: ${issueKey}, commentId: ${commentId || 'all'}`);
        
        const result = await jiraCommentService.readComments(issueKey, commentId, expand);
        
        if (result.success) {
          if (commentId && 'data' in result && result.data && !('comments' in result.data)) {
            // Single comment - result.data is JiraComment
            const comment = result.data as JiraComment;
            const markdown = jiraCommentService.formatCommentForDisplay(comment);
            return {
              markdown: `# Comment from ${issueKey}\n\n${markdown}`,
              json: comment,
              url: jiraCommentService.getCommentUrl(issueKey, comment.id || "")
            };
          } else if ('data' in result && result.data && 'comments' in result.data) {
            // Multiple comments - result.data has comments array
            const commentsData = result.data as { comments: JiraComment[]; maxResults: number; total: number; startAt: number; };
            let markdown = `# Comments from ${issueKey}\n\n`;
            markdown += `**Total:** ${commentsData.total} comments\n\n`;
            
            commentsData.comments.forEach((comment) => {
              markdown += jiraCommentService.formatCommentForDisplay(comment) + '\n---\n\n';
            });
            
            return {
              markdown,
              json: commentsData,
              url: `${process.env.JIRA_BASE_URL}/browse/${issueKey}`
            };
          }
        }
        
        return {
          markdown: `❌ Error reading comments: ${result.error}`,
          json: { error: result.error, details: result.details }
        };
      }
      break;
    }

    case "update_comment": {
      if (input.domain === "ticket") {
        const { issueKey, commentId, body, visibility } = input.context;
        
        if (!issueKey) {
          appendJiraToolLog("[ERROR] jiraToolHandler (update_comment): issueKey is required.");
          return {
            markdown: "❌ Error: issueKey is required for comment operations.",
            json: { error: "issueKey is required" },
          };
        }

        if (!commentId) {
          appendJiraToolLog("[ERROR] jiraToolHandler (update_comment): commentId is required.");
          return {
            markdown: "❌ Error: commentId is required to update a comment.",
            json: { error: "commentId is required" },
          };
        }

        if (!body) {
          appendJiraToolLog("[ERROR] jiraToolHandler (update_comment): body is required.");
          return {
            markdown: "❌ Error: body is required to update a comment.",
            json: { error: "body is required" },
          };
        }

        appendJiraToolLog(`[INFO] jiraToolHandler (update_comment): Updating comment ${commentId} for issue: ${issueKey}`);
        
        const request: JiraCommentUpdateRequest = {
          body: body as string | AdfNode,
          ...(visibility && { visibility })
        };

        const result = await jiraCommentService.updateComment(issueKey, commentId, request);
        
        if (result.success && result.data) {
          const markdown = jiraCommentService.formatCommentForDisplay(result.data);
          return {
            markdown: `# ✅ Comment Updated Successfully\n\n${markdown}`,
            json: result.data,
            url: jiraCommentService.getCommentUrl(issueKey, result.data.id || "")
          };
        } else {
          return {
            markdown: `❌ Error updating comment: ${result.error}`,
            json: { error: result.error, details: result.details }
          };
        }
      }
      break;
    }

    case "delete_comment": {
      if (input.domain === "ticket") {
        const { issueKey, commentId } = input.context;
        
        if (!issueKey) {
          appendJiraToolLog("[ERROR] jiraToolHandler (delete_comment): issueKey is required.");
          return {
            markdown: "❌ Error: issueKey is required for comment operations.",
            json: { error: "issueKey is required" },
          };
        }

        if (!commentId) {
          appendJiraToolLog("[ERROR] jiraToolHandler (delete_comment): commentId is required.");
          return {
            markdown: "❌ Error: commentId is required to delete a comment.",
            json: { error: "commentId is required" },
          };
        }

        appendJiraToolLog(`[INFO] jiraToolHandler (delete_comment): Deleting comment ${commentId} from issue: ${issueKey}`);
        
        const result = await jiraCommentService.deleteComment(issueKey, commentId);
        
        if (result.success) {
          return {
            markdown: `# ✅ Comment Deleted Successfully\n\n**Issue:** ${issueKey}\n**Comment ID:** ${commentId}\n\nThe comment has been permanently removed from the JIRA issue.`,
            json: { message: "Comment deleted successfully", issueKey, commentId },
            url: `${process.env.JIRA_BASE_URL}/browse/${issueKey}`
          };
        } else {
          return {
            markdown: `❌ Error deleting comment: ${result.error}`,
            json: { error: result.error, details: result.details }
          };
        }
      }
      break;
    }

    case "list_comments": {
      if (input.domain === "ticket") {
        const { issueKey } = input.context;
        
        if (!issueKey) {
          appendJiraToolLog("[ERROR] jiraToolHandler (list_comments): issueKey is required.");
          return {
            markdown: "❌ Error: issueKey is required for comment operations.",
            json: { error: "issueKey is required" },
          };
        }

        appendJiraToolLog(`[INFO] jiraToolHandler (list_comments): Listing comments for issue: ${issueKey} with filters`);
        
        const {
          since, until, lastMinutes, lastHours, lastDays,
          authorAccountId, authorDisplayName, authorEmail,
          textSearch, startAt, maxResults, orderBy, expand, includeDeleted
        } = input.context;
        
        const listRequest = {
          ...(since && { since }),
          ...(until && { until }),
          ...(lastMinutes && { lastMinutes }),
          ...(lastHours && { lastHours }),
          ...(lastDays && { lastDays }),
          ...(authorAccountId && { authorAccountId }),
          ...(authorDisplayName && { authorDisplayName }),
          ...(authorEmail && { authorEmail }),
          ...(textSearch && { textSearch }),
          ...(startAt !== undefined && { startAt }),
          ...(maxResults && { maxResults }),
          ...(orderBy && { orderBy }),
          ...(expand && { expand }),
          ...(includeDeleted && { includeDeleted })
        };
        
        const result = await jiraCommentService.listComments(issueKey, listRequest);
        
        if (result.success && result.data) {
          const markdown = jiraCommentService.formatCommentListForDisplay(result.data, issueKey);
          return {
            markdown,
            json: result.data,
            url: `${process.env.JIRA_BASE_URL}/browse/${issueKey}`
          };
        } else {
          return {
            markdown: `❌ Error listing comments: ${result.error}`,
            json: { error: result.error, details: result.details }
          };
        }
      }
      break;
    }

    case "list":
      if (input.domain === "project") {
        const projects = await listJiraProjects();
        let markdown = `# Available JIRA Projects\n\n`;
        markdown += `| Key | Name | Lead |\n`;
        markdown += `|-----|------|------|\n`;
        for (const project of projects) {
          markdown += `| **${project.key}** | ${project.name} | ${project.lead} |\n`;
        }
        markdown += `\n*Use the project key when creating epics or tickets.*`;
        
        return {
          markdown,
          json: projects,
        };
      }
      break;
    case "read":
      if (input.domain === "ticket") {
        const issueKeyToFetch = input.context.issueKey;
        if (!issueKeyToFetch) {
          appendJiraToolLog("[ERROR] jiraToolHandler (read): issueKey is required.");
          return {
            markdown: "❌ Error: issueKey is required for read action.",
            json: { error: "issueKey is required" },
          };
        }
        appendJiraToolLog(`[INFO] jiraToolHandler (read): Fetching details for issueKey: ${issueKeyToFetch}`);
        try {
          const ticketData = await getJiraTicketByKey(issueKeyToFetch) as BasicJiraTicket; 
          const ticketUrl = `${getJiraEnv().baseUrl}/browse/${ticketData.key}`;
          const markdownSummary = formatJiraTicketToMarkdown(ticketData);
          
          return {
            markdown: markdownSummary,
            json: ticketData, // Full JSON data
            url: ticketUrl,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          appendJiraToolLog(`[ERROR] jiraToolHandler (read): Failed to fetch ${issueKeyToFetch}: ${errorMsg}`);
          return {
            markdown: `❌ Error fetching JIRA ticket ${issueKeyToFetch}: ${errorMsg}`,
            json: { error: errorMsg, issueKey: issueKeyToFetch },
          };
        }
      } else {
        appendJiraToolLog(`[ERROR] jiraToolHandler (read): Invalid domain '${input.domain}'. Must be 'ticket'.`);
        return {
          markdown: `❌ Error: read action is only valid for the 'ticket' domain.`, 
          json: { error: "Invalid domain for read" }
        };
      }
    case "find":
      if (input.domain === "ticket") {
        // Simplified 'find' action: primarily for finding assigned tickets. 
        // For finding a specific ticket by key, use 'read'.
        const projectKey = input.context.projectKey || '';
        appendJiraToolLog(`[INFO] jiraToolHandler (find/ticket): Finding assigned tickets for projectKey: '${projectKey}'`);
        const tickets = await findAssignedTickets(projectKey) as Record<string, unknown>[];
        let markdown = projectKey
          ? `# Tickets assigned to you in project ${projectKey}\n\n`
          : `# Tickets assigned to you (all projects)\n\n`;
        if (tickets.length === 0) {
          markdown += "No tickets assigned to you.";
        } else {
          for (const t of tickets) {
            markdown += projectKey
              ? `- [${t.key as string}](${t.url as string}): ${t.summary as string} _(Status: ${t.status as string})_\n`
              : `- [${t.key as string}](${t.url as string}) (Project: ${t.project as string}): ${t.summary as string} _(Status: ${t.status as string})_\n`;
          }
        }
        return {
          markdown,
          json: tickets,
        };
      }
      break;
    case "verify_credentials": {
      appendJiraToolLog("[INFO] jiraToolHandler: Executing verify_credentials.");
      const verificationResult = await verifyJiraApiCredentials();
      return {
        markdown: `# JIRA Credential Verification\n\nStatus: ${verificationResult.success ? 'SUCCESS' : 'FAILED'}\nMessage: ${verificationResult.message}\n\nData:\n\`\`\`json\n${JSON.stringify(verificationResult.data, null, 2)}\n\`\`\``,
        json: verificationResult,
      };
    }
    case "update":
      if (input.domain === "ticket") {
        const { issueKey, assigneeAccountId, assignee, summary, description, labels, issueType /* add other fields as needed */ } = input.context;

        if (!issueKey) {
          appendJiraToolLog("[ERROR] jiraToolHandler (update/ticket): issueKey is required.");
          return {
            markdown: "❌ Error: issueKey is required for the update ticket action.",
            json: { error: "issueKey is required" },
          };
        }

        const fieldsToUpdate: Record<string, unknown> = {};
        let foundAssigneeAccountId = assigneeAccountId;

        // If assigneeAccountId is not directly provided, try to find user by assignee (username/email)
        if (!foundAssigneeAccountId && assignee && typeof assignee === 'string') {
          appendJiraToolLog(`[INFO] jiraToolHandler (update/ticket): Assignee Account ID not provided, searching for user '${assignee}'`);
          try {
            const jiraUser = await findJiraUser(assignee);
            if (jiraUser && jiraUser.accountId) {
              foundAssigneeAccountId = jiraUser.accountId;
              appendJiraToolLog(`[INFO] jiraToolHandler (update/ticket): Found user '${assignee}' with accountId: ${foundAssigneeAccountId}`);
            } else {
              appendJiraToolLog(`[WARN] jiraToolHandler (update/ticket): User '${assignee}' not found or accountId missing.`);
              // Return a specific warning if user lookup failed but other updates might proceed, 
              // or an error if assignment was the primary goal.
              // For now, we'll let it proceed if other fields are to be updated, but an error could be returned here.
              // To make it an error: 
              // return {
              //   markdown: `⚠️ User '${assignee}' not found or could not be resolved for assignment.`,
              //   json: { error: `User '${assignee}' not found.`, issueKey },
              // };
            }
          } catch (userSearchError) {
            const errorMsg = userSearchError instanceof Error ? userSearchError.message : String(userSearchError);
            appendJiraToolLog(`[ERROR] jiraToolHandler (update/ticket): Error searching for user '${assignee}': ${errorMsg}`);
            // Decide if this is a fatal error for the update operation
            // return {
            //  markdown: `❌ Error searching for assignee '${assignee}': ${errorMsg}`,
            //  json: { error: `Error searching for assignee '${assignee}': ${errorMsg}`, issueKey },
            // };
          }
        }

        if (foundAssigneeAccountId) {
          fieldsToUpdate.assignee = { accountId: foundAssigneeAccountId };
        }
        
        // Add other fields to update
        if (summary) {
          fieldsToUpdate.summary = summary;
        }
        if (description) {
          fieldsToUpdate.description = toADF(description, input.context.metadata);
        }
        if (labels && Array.isArray(labels)) {
          fieldsToUpdate.labels = labels;
        }
        if (issueType) { 
          fieldsToUpdate.issuetype = { name: issueType }; 
        }
        
        if (Object.keys(fieldsToUpdate).length === 0) {
          let message = "⚠️ No valid update fields provided or assignee lookup failed.";
          if (assignee && !foundAssigneeAccountId && Object.keys(fieldsToUpdate).length === 0){
            message = `⚠️ User '${assignee}' could not be found for assignment, and no other update fields were provided.`
          }
          appendJiraToolLog(`[INFO] jiraToolHandler (update/ticket): ${message} For issueKey: ${issueKey}.`);
          return {
            markdown: message,
            json: { warning: message, issueKey },
          };
        }

        const updatePayload = { fields: fieldsToUpdate };

        appendJiraToolLog(`[INFO] jiraToolHandler (update/ticket): Updating issue ${issueKey} with payload: ${JSON.stringify(updatePayload)}`);
        try {
          await updateJiraTicket(issueKey, updatePayload);
          const updatedTicketData = await getJiraTicketByKey(issueKey) as BasicJiraTicket;
          const ticketUrl = `${getJiraEnv().baseUrl}/browse/${updatedTicketData.key}`;
          const markdownSummary = formatJiraTicketToMarkdown(updatedTicketData);

          return {
            markdown: `# ✅ JIRA Ticket ${issueKey} Updated\n\n${markdownSummary}`,
            json: updatedTicketData,
            url: ticketUrl,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          appendJiraToolLog(`[ERROR] jiraToolHandler (update/ticket): Failed to update ${issueKey}: ${errorMsg}`);
          return {
            markdown: `❌ Error updating JIRA ticket ${issueKey}: ${errorMsg}`,
            json: { error: errorMsg, issueKey },
          };
        }
      } else {
        appendJiraToolLog(`[ERROR] jiraToolHandler (update): Invalid domain '${input.domain}'. Must be 'ticket'.`);
        return {
          markdown: `❌ Error: update action is only valid for the 'ticket' domain.`, 
          json: { error: "Invalid domain for update action" }
        };
      }
    case "find_user": {
      if (input.domain !== "user") {
        appendJiraToolLog(`[ERROR] jiraToolHandler (find_user): Invalid domain '${input.domain}'. Must be 'user'.`);
        return {
          markdown: `❌ Error: find_user action is only valid for the 'user' domain.`,
          json: { error: "Invalid domain for find_user action" },
        };
      }
      const userQuery = input.context.userQuery || input.context.summary; // Allow using summary as a fallback for query
      if (!userQuery) {
        appendJiraToolLog("[ERROR] jiraToolHandler (find_user): userQuery (or summary) is required.");
        return {
          markdown: "❌ Error: userQuery (or context.summary) is required for find_user action.",
          json: { error: "userQuery is required" },
        };
      }
      appendJiraToolLog(`[INFO] jiraToolHandler (find_user): Searching for user with query: ${userQuery}`);
      try {
        const userResult = await findJiraUser(userQuery);
        if (userResult) {
          const jiraUser = userResult as JiraUser; 
          let md = `# User Found\n\n`;
          md += `**Display Name:** ${jiraUser.displayName || "N/A"}\n`;
          md += `**Account ID:** ${jiraUser.accountId || "N/A"}\n`;
          md += `**Email:** ${jiraUser.emailAddress || "N/A"}\n`;
          if (jiraUser.avatarUrls) {
            md += `**Avatar (48x48):** ![Avatar](${jiraUser.avatarUrls['48x48'] || ''})\n`;
          }

          return {
            markdown: md,
            json: jiraUser, 
          };
        } else {
          appendJiraToolLog(`[INFO] jiraToolHandler (find_user): No user found for query: ${userQuery}`);
          return {
            markdown: `ℹ️ No JIRA user found matching query: "${userQuery}" `,
            json: { message: "No user found", query: userQuery },
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        appendJiraToolLog(`[ERROR] jiraToolHandler (find_user): Error searching for JIRA user '${userQuery}': ${errorMsg}`);
        return {
          markdown: `❌ Error searching for JIRA user '${userQuery}': ${errorMsg}`,
          json: { error: errorMsg, query: userQuery },
        };
      }
    }
    case "history":
      if (input.domain === "ticket") {
        const issueKey = input.context.issueKey;
        if (!issueKey) {
          appendJiraToolLog("[ERROR] jiraToolHandler (history): issueKey is required.");
          return {
            markdown: "❌ Error: issueKey is required for history action.",
            json: { error: "issueKey is required" },
          };
        }
        appendJiraToolLog(`[INFO] jiraToolHandler (history): Fetching history for issue: ${issueKey}`);
        try {
          const historyData = await getJiraTicketHistory(issueKey, input.options?.page, input.options?.limit);
          const markdownSummary = formatChangelogToTimelineMarkdown(issueKey, historyData, new Set());
          
          return {
            markdown: markdownSummary,
            json: historyData, // Return the raw changelog data as well
            url: `${getJiraEnv().baseUrl}/browse/${issueKey}?focusedCommentId=&page=com.atlassian.jira.plugin.system.issuetabpanels%3Achangelog-tabpanel`,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          appendJiraToolLog(`[ERROR] jiraToolHandler (history): Failed to fetch history for ${issueKey}: ${errorMsg}`);
          return {
            markdown: `❌ Error fetching history for JIRA ticket ${issueKey}: ${errorMsg}`,
            json: { error: errorMsg, issueKey },
          };
        }
      } else {
        appendJiraToolLog(`[ERROR] jiraToolHandler (history): Invalid domain '${input.domain}'. Must be 'ticket'.`);
        return {
          markdown: `❌ Error: history action is only valid for the 'ticket' domain.`, 
          json: { error: "Invalid domain for history action" }
        };
      }
    case "get_comment_tasks":
      if (input.domain === "ticket") {
        const issueKey = input.context.issueKey;
        const includeMedia = input.context.includeMedia as boolean ?? true;  // Default to true
        
        if (!issueKey) {
          appendJiraToolLog("[ERROR] jiraToolHandler (get_comment_tasks): issueKey is required.");
          return {
            markdown: "❌ Error: issueKey is required for get_comment_tasks action.",
            json: { error: "issueKey is required" },
          };
        }
        
        appendJiraToolLog(`[INFO] jiraToolHandler (get_comment_tasks): Fetching comment tasks for issue: ${issueKey}, includeMedia: ${includeMedia}`);
        try {
          // Get full ticket data including comments
          const ticketData = await getJiraTicketByKey(issueKey) as BasicJiraTicket;
          const comments = ticketData.fields?.comment?.comments || [];
          
          if (comments.length === 0) {
            return {
              markdown: `# No Comments Found\n\nJIRA ticket ${issueKey} has no comments to scan for tasks.`,
              json: { comments: [], totalTasks: 0 },
              url: `${getJiraEnv().baseUrl}/browse/${issueKey}`,
            };
          }
          
          // Parse all comments for tasks with media support
          const { baseUrl, email, apiToken } = getJiraEnv();
          const auth = includeMedia ? Buffer.from(`${email}:${apiToken}`).toString("base64") : undefined;
          
          const parseOptions = {
            includeMedia,
            baseUrl,
            auth: auth
          };
          
          const parseResult = await parseCommentsForTasks(comments, parseOptions);
          
          // Create simplified response structure
          const simplifiedTasks = parseResult.tasks.map(task => {
            const enhancedTask = task as EnhancedCommentTask;
            
            // Only include successful downloads
            const successfulImages = enhancedTask.downloadedImages?.filter(img => img.base64Data && !img.error) || [];
            
            return {
              id: task.id,
              text: task.text,
              completed: task.completed,
              author: task.author,
              commentId: task.commentId,
              
              // Simplified media section - only include successful downloads
              images: successfulImages.map(img => ({
                id: img.id,
                base64Data: img.base64Data,  // Agents look for this
                contentType: img.contentType
              })),
              
              // Simplified UI context
              uiHints: enhancedTask.uiContext ? {
                pages: enhancedTask.uiContext.pages,
                components: enhancedTask.uiContext.components,
                actions: enhancedTask.uiContext.actions,
                codebaseSearches: enhancedTask.uiContext.searchQueries.slice(0, 5)
              } : undefined,
              
              // Essential flags for agents
              hasImages: successfulImages.length > 0,
              isOcrReady: successfulImages.length > 0
            };
          });
          
          // Simplified markdown
          let markdown = `# Comment Tasks for ${issueKey}\n\n`;
          markdown += `**Total Tasks:** ${parseResult.totalTasks} | **Pending:** ${parseResult.pendingTasks} | **Completed:** ${parseResult.completedTasks}\n\n`;
          
          const tasksWithImages = simplifiedTasks.filter(task => task.hasImages);
          if (tasksWithImages.length > 0) {
            markdown += `## 📷 Tasks with Downloaded Images (${tasksWithImages.length})\n\n`;
            tasksWithImages.forEach((task, index) => {
              markdown += `### ${index + 1}. ${task.text}\n`;
              markdown += `**Images:** ${task.images.length} successfully downloaded\n`;
              if (task.uiHints) {
                markdown += `**UI Context:** Pages: ${task.uiHints.pages.join(', ')} | Components: ${task.uiHints.components.join(', ')}\n`;
              }
              markdown += `\n`;
            });
          }
          
          // Simplified JSON response
          return {
            markdown,
            json: {
              issueKey,
              totalTasks: parseResult.totalTasks,
              pendingTasks: parseResult.pendingTasks,
              completedTasks: parseResult.completedTasks,
              
              // Main tasks array - simplified structure
              tasks: simplifiedTasks,
              
              // Summary stats
              summary: {
                tasksWithImages: tasksWithImages.length,
                totalImagesDownloaded: simplifiedTasks.reduce((total, task) => total + task.images.length, 0),
                ocrReadyTasks: simplifiedTasks.filter(task => task.isOcrReady).length,
                detectedPages: [...new Set(simplifiedTasks.flatMap(task => task.uiHints?.pages || []))],
                detectedComponents: [...new Set(simplifiedTasks.flatMap(task => task.uiHints?.components || []))]
              }
            },
            url: `${getJiraEnv().baseUrl}/browse/${issueKey}`,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          appendJiraToolLog(`[ERROR] jiraToolHandler (get_comment_tasks): Failed to fetch comment tasks for ${issueKey}: ${errorMsg}`);
          return {
            markdown: `❌ Error fetching comment tasks for JIRA ticket ${issueKey}: ${errorMsg}`,
            json: { error: errorMsg, issueKey },
          };
        }
      } else {
        appendJiraToolLog(`[ERROR] jiraToolHandler (get_comment_tasks): Invalid domain '${input.domain}'. Must be 'ticket'.`);
        return {
          markdown: `❌ Error: get_comment_tasks action is only valid for the 'ticket' domain.`, 
          json: { error: "Invalid domain for get_comment_tasks" }
        };
      }
      break;
    case "update_comment_task":
      if (input.domain === "ticket") {
        const { issueKey, taskId, completed } = input.context;
        
        if (!issueKey || !taskId || completed === undefined) {
          appendJiraToolLog("[ERROR] jiraToolHandler (update_comment_task): issueKey, taskId, and completed are required.");
          return {
            markdown: "❌ Error: issueKey, taskId, and completed are required for update_comment_task action.",
            json: { error: "Missing required parameters" },
          };
        }
        
        appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Starting task update - taskId: ${taskId}, issue: ${issueKey}, completed: ${completed}`);
        
        try {
          const taskIdStr = taskId as string;
          
          // Check if it looks like a raw JIRA localId (UUID format)
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskIdStr)) {
            appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Processing ADF taskItem with localId: ${taskIdStr}`);
            
            // Step 1: Get the full ticket with comments to find the taskItem
            const ticketData = await getJiraTicketByKey(issueKey) as BasicJiraTicket;
            const comments = ticketData.fields?.comment?.comments || [];
            appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Found ${comments.length} comments to search`);
            
            let targetComment: JiraComment | null = null;
            let taskItemFound = false;
            
            // Step 2: Search through comments to find the one containing this taskItem
            for (const comment of comments) {
              if (comment.body && typeof comment.body === 'object' && comment.body.type === 'doc') {
                // Recursively search ADF structure for taskItem with matching localId
                function findTaskItem(node: AdfNode): boolean {
                  if (node.type === 'taskItem' && node.attrs?.localId === taskIdStr) {
                    return true;
                  }
                  if (node.content) {
                    return node.content.some(findTaskItem);
                  }
                  return false;
                }
                
                if (findTaskItem(comment.body as AdfNode)) {
                  targetComment = comment;
                  taskItemFound = true;
                  appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Found taskItem in comment ${comment.id}`);
                  break;
                }
              }
            }
            
            if (!taskItemFound || !targetComment) {
              appendJiraToolLog(`[ERROR] jiraToolHandler (update_comment_task): TaskItem with localId ${taskIdStr} not found in any comment`);
              return {
                markdown: `❌ Error: TaskItem with ID ${taskIdStr} not found in ticket ${issueKey} comments.`,
                json: { error: "TaskItem not found", taskId: taskIdStr, issueKey },
                url: `${getJiraEnv().baseUrl}/browse/${issueKey}`,
              };
            }
            
            // Step 3: Clone and update the comment's ADF structure
            const updatedBody = JSON.parse(JSON.stringify(targetComment.body));
            let updateCount = 0;
            
            function updateTaskItem(node: AdfNode): void {
              if (node.type === 'taskItem' && node.attrs?.localId === taskIdStr) {
                node.attrs.state = completed ? 'DONE' : 'TODO';
                updateCount++;
                appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Updated taskItem ${taskIdStr} state to ${node.attrs.state}`);
              }
              if (node.content) {
                node.content.forEach(updateTaskItem);
              }
            }
            
            updateTaskItem(updatedBody);
            
            if (updateCount === 0) {
              appendJiraToolLog(`[ERROR] jiraToolHandler (update_comment_task): Failed to update taskItem in cloned structure`);
              return {
                markdown: `❌ Error: Failed to update taskItem ${taskIdStr} in comment structure.`,
                json: { error: "Failed to update taskItem", taskId: taskIdStr },
              };
            }
            
            // Step 4: Update the comment via JIRA API
            const { baseUrl, email, apiToken } = getJiraEnv();
            const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
            const updateUrl = `${baseUrl}/rest/api/3/issue/${issueKey}/comment/${targetComment.id}`;
            
            appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Updating comment ${targetComment.id} via API`);
            
            const updatePayload = {
              body: updatedBody
            };
            
            const response = await fetch(updateUrl, {
              method: "PUT",
              headers: {
                "Authorization": `Basic ${auth}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(updatePayload),
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              appendJiraToolLog(`[ERROR] jiraToolHandler (update_comment_task): JIRA API error ${response.status}: ${errorText}`);
              return {
                markdown: `❌ Error updating JIRA comment: ${response.status} ${errorText}`,
                json: { error: `JIRA API error: ${response.status}`, details: errorText },
              };
            }
            
            appendJiraToolLog(`[SUCCESS] jiraToolHandler (update_comment_task): Successfully updated taskItem ${taskIdStr} to ${completed ? 'DONE' : 'TODO'}`);
            
            return {
              markdown: `# ✅ Comment Task Successfully Updated\n\n**Issue:** ${issueKey}\n**Task ID:** ${taskIdStr}\n**Status:** ${completed ? 'Completed ✓' : 'Reopened ○'}\n**Comment:** ${targetComment.id}\n**Method:** Updated ADF taskItem via JIRA API\n\n🎯 **Task has been ${completed ? 'marked as complete' : 'reopened'} in the JIRA comment.**\n\n[View updated comment in JIRA](${getJiraEnv().baseUrl}/browse/${issueKey})`,
              json: {
                issueKey,
                taskId: taskIdStr,
                completed,
                commentId: targetComment.id,
                updated: true,
                method: "ADF taskItem API update",
                newState: completed ? 'DONE' : 'TODO'
              },
              url: `${getJiraEnv().baseUrl}/browse/${issueKey}`,
            };
          }
          // Handle our generated task ID formats (existing logic for ct_ and adf_ prefixes)
          else {
            appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Processing non-UUID task ID format: ${taskIdStr}`);
            
            // Enhanced task ID parsing for our generated formats
            let updateMethod = '';
            let taskInfo: { commentId?: string; localId?: string; lineNumber?: string; type: string } = { type: "Unknown" };
            let isAdfTask = false;
            
            // Check if it's our generated ADF task ID: adf_{commentId}_{localId}
            if (taskIdStr.startsWith('adf_')) {
              const parts = taskIdStr.split('_');
              if (parts.length >= 3) {
                const commentId = parts[1];
                const localId = parts.slice(2).join('_'); // Handle localIds with underscores
                updateMethod = "Update ADF taskItem via JIRA API";
                taskInfo = { commentId, localId, type: "ADF taskItem" };
                isAdfTask = true;
                
                appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Implementing ADF task update - commentId: ${commentId}, localId: ${localId}`);
                
                // Step 1: Get the full ticket to access comments
                const ticketData = await getJiraTicketByKey(issueKey) as BasicJiraTicket;
                const comments = ticketData.fields?.comment?.comments || [];
                
                // Step 2: Find the specific comment by ID
                const targetComment = comments.find(comment => comment.id === commentId);
                
                if (!targetComment) {
                  appendJiraToolLog(`[ERROR] jiraToolHandler (update_comment_task): Comment with ID ${commentId} not found in ticket ${issueKey}`);
                  return {
                    markdown: `❌ Error: Comment with ID ${commentId} not found in ticket ${issueKey}.`,
                    json: { error: "Comment not found", commentId, issueKey },
                    url: `${getJiraEnv().baseUrl}/browse/${issueKey}`,
                  };
                }
                
                // Step 3: Verify the comment has ADF content
                if (!targetComment.body || typeof targetComment.body !== 'object' || targetComment.body.type !== 'doc') {
                  appendJiraToolLog(`[ERROR] jiraToolHandler (update_comment_task): Comment ${commentId} does not contain ADF content`);
                  return {
                    markdown: `❌ Error: Comment ${commentId} does not contain ADF content that can be updated.`,
                    json: { error: "Comment not ADF format", commentId, issueKey },
                    url: `${getJiraEnv().baseUrl}/browse/${issueKey}`,
                  };
                }
                
                // Step 4: Clone and search for the taskItem with matching localId
                const updatedBody = JSON.parse(JSON.stringify(targetComment.body));
                let updateCount = 0;
                let taskItemFound = false;
                
                function findAndUpdateTaskItem(node: AdfNode): void {
                  if (node.type === 'taskItem' && node.attrs?.localId === localId) {
                    node.attrs.state = completed ? 'DONE' : 'TODO';
                    updateCount++;
                    taskItemFound = true;
                    appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Updated taskItem ${localId} state to ${node.attrs.state}`);
                  }
                  if (node.content) {
                    node.content.forEach(findAndUpdateTaskItem);
                  }
                }
                
                findAndUpdateTaskItem(updatedBody);
                
                if (!taskItemFound || updateCount === 0) {
                  appendJiraToolLog(`[ERROR] jiraToolHandler (update_comment_task): TaskItem with localId ${localId} not found in comment ${commentId}`);
                  return {
                    markdown: `❌ Error: TaskItem with localId ${localId} not found in comment ${commentId}.`,
                    json: { error: "TaskItem not found in comment", localId, commentId, issueKey },
                    url: `${getJiraEnv().baseUrl}/browse/${issueKey}`,
                  };
                }
                
                // Step 5: Update the comment via JIRA API
                const { baseUrl, email, apiToken } = getJiraEnv();
                const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
                const updateUrl = `${baseUrl}/rest/api/3/issue/${issueKey}/comment/${commentId}`;
                
                appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Updating comment ${commentId} via JIRA API`);
                
                const updatePayload = {
                  body: updatedBody
                };
                
                const response = await fetch(updateUrl, {
                  method: "PUT",
                  headers: {
                    "Authorization": `Basic ${auth}`,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(updatePayload),
                });
                
                if (!response.ok) {
                  const errorText = await response.text();
                  appendJiraToolLog(`[ERROR] jiraToolHandler (update_comment_task): JIRA API error ${response.status}: ${errorText}`);
                  return {
                    markdown: `❌ Error updating JIRA comment: ${response.status} ${errorText}`,
                    json: { error: `JIRA API error: ${response.status}`, details: errorText },
                  };
                }
                
                appendJiraToolLog(`[SUCCESS] jiraToolHandler (update_comment_task): Successfully updated ADF taskItem ${localId} to ${completed ? 'DONE' : 'TODO'}`);
                
                return {
                  markdown: `# ✅ Comment Task Successfully Updated\n\n**Issue:** ${issueKey}\n**Task ID:** ${taskIdStr}\n**Status:** ${completed ? 'Completed ✓' : 'Reopened ○'}\n**Comment:** ${commentId}\n**Local ID:** ${localId}\n**Method:** Updated ADF taskItem via JIRA API\n\n🎯 **Task has been ${completed ? 'marked as complete' : 'reopened'} in the JIRA comment.**\n\n[View updated comment in JIRA](${getJiraEnv().baseUrl}/browse/${issueKey})`,
                  json: {
                    issueKey,
                    taskId: taskIdStr,
                    completed,
                    updateMethod,
                    taskInfo,
                    isAdfTask: true,
                    updated: true,
                    commentId,
                    localId,
                    newState: completed ? 'DONE' : 'TODO'
                  },
                  url: `${getJiraEnv().baseUrl}/browse/${issueKey}`,
                };
              }
            }
            // Check if it's our generated text task ID: ct_{commentId}_{line}_{hash}
            else if (taskIdStr.startsWith('ct_')) {
              const parts = taskIdStr.split('_');
              if (parts.length >= 4) {
                const commentId = parts[1];
                const lineNumber = parts[2];
                updateMethod = "Update comment text via JIRA API";
                taskInfo = { commentId, lineNumber, type: "Text-based task" };
              }
            }
            // Fallback: treat as unknown format
            else {
              updateMethod = "Unknown task ID format";
              taskInfo = { type: "Unknown task format" };
            }
            
            appendJiraToolLog(`[INFO] jiraToolHandler (update_comment_task): Parsed task format - Method: ${updateMethod}, Type: ${taskInfo.type}`);
            
            // For non-ADF formats, return guidance for these formats (could implement text-based updates later)
            if (!isAdfTask) {
              const guidanceText = taskInfo.lineNumber ? 
                `This text-based task would be updated by modifying comment ${taskInfo.commentId} at line ${taskInfo.lineNumber}` :
                `Task format not recognized. Expected format: adf_{commentId}_{localId} or ct_{commentId}_{line}_{hash}`;
              
              return {
                markdown: `# 📋 Comment Task Update Request\n\n**Issue:** ${issueKey}\n**Task ID:** ${taskId}\n**Status:** ${completed ? 'Mark Completed' : 'Mark Pending'}\n**Method:** ${updateMethod}\n\n${guidanceText}\n\n**Next Steps:**\n${taskInfo.lineNumber ? 
                  '- Parse comment text to find and update checkbox\n- Update comment via JIRA API' :
                  '- Identify task format and implement appropriate update logic'
                }\n\n*Note: This format requires additional implementation for full automation.*`,
                json: {
                  issueKey,
                  taskId, 
                  completed,
                  updateMethod,
                  taskInfo,
                  isAdfTask: false,
                  updated: false,
                  message: "Non-ADF task format - additional implementation needed"
                },
                url: `${getJiraEnv().baseUrl}/browse/${issueKey}`,
              };
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          appendJiraToolLog(`[ERROR] jiraToolHandler (update_comment_task): Exception during task update: ${errorMsg}`);
          return {
            markdown: `❌ Error updating comment task: ${errorMsg}`,
            json: { error: errorMsg, issueKey, taskId },
          };
        }
      } else {
        appendJiraToolLog(`[ERROR] jiraToolHandler (update_comment_task): Invalid domain '${input.domain}'. Must be 'ticket'.`);
        return {
          markdown: `❌ Error: update_comment_task action is only valid for the 'ticket' domain.`, 
          json: { error: "Invalid domain for update_comment_task" }
        };
      }
      break;
    case "delete":
      if (input.domain === "ticket") {
        const { issueKey } = input.context;
        
        if (!issueKey) {
          appendJiraToolLog("[ERROR] jiraToolHandler (delete): issueKey is required.");
          return {
            markdown: "❌ Error: issueKey is required for delete action.",
            json: { error: "issueKey is required" },
          };
        }
        
        appendJiraToolLog(`[INFO] jiraToolHandler (delete): Deleting ticket: ${issueKey}`);
        
        try {
          const { baseUrl, email, apiToken } = getJiraEnv();
          const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
          const deleteUrl = `${baseUrl}/rest/api/3/issue/${issueKey}`;
          
          const deleteResponse = await fetch(deleteUrl, {
            method: "DELETE",
            headers: {
              "Authorization": `Basic ${auth}`,
            },
          });
          
          if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            appendJiraToolLog(`[ERROR] jiraToolHandler (delete): JIRA API error deleting ${issueKey}: ${deleteResponse.status} ${errorText}`);
            return {
              markdown: `❌ Error deleting JIRA ticket ${issueKey}: ${deleteResponse.status} ${errorText}`,
              json: { error: errorText, issueKey },
            };
          }
          
          appendJiraToolLog(`[SUCCESS] jiraToolHandler (delete): Successfully deleted ticket ${issueKey}`);
          return {
            markdown: `# ✅ JIRA Ticket ${issueKey} Deleted`,
            json: { message: "Ticket deleted successfully", issueKey },
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          appendJiraToolLog(`[ERROR] jiraToolHandler (delete): Exception during ticket deletion: ${errorMsg}`);
          return {
            markdown: `❌ Error deleting JIRA ticket ${issueKey}: ${errorMsg}`,
            json: { error: errorMsg, issueKey },
          };
        }
      } else {
        appendJiraToolLog(`[ERROR] jiraToolHandler (delete): Invalid domain '${input.domain}'. Must be 'ticket'.`);
        return {
          markdown: `❌ Error: delete action is only valid for the 'ticket' domain.`, 
          json: { error: "Invalid domain for delete action" }
        };
      }
    default:
      appendJiraToolLog(`[ERROR] jiraToolHandler: Unsupported action/domain: Action=${input.action}, Domain=${input.domain}`);
      return {
        markdown: `❌ Error: Unsupported action '${input.action}' for domain '${input.domain}'.`,
        json: { error: "Unsupported action/domain combination" },
      };
  }

  // Default error handler for unsupported combinations
  appendJiraToolLog(`[ERROR] jiraToolHandler: Unhandled action/domain combination: Action=${input.action}, Domain=${input.domain}`);
  return {
    markdown: `❌ Error: Unsupported action '${input.action}' for domain '${input.domain}'.`,
    json: { error: "Unsupported action/domain combination" },
  };
}

// Integration points:
// - Call this handler from project tools, passing project context
// - Store/read JIRA ticket metadata in data/projects/{project}/jira-tickets.json
// - Use prompt templates in src/prompts/templates_en/tools/jira/ (to be created) 