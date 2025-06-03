import "dotenv/config";
import { z } from "zod";
import fetch from "node-fetch";
import fs from "fs/promises";
import fsSync from 'fs';
import path from "path";

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
  // attrs?: any; // Could be further specified if needed
  // marks?: any[]; // Could be further specified if needed
}

interface JiraComment {
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
  action: z.enum(["create", "update", "read", "find", "list", "sync", "verify_credentials", "find_user"]),
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
    // Add more fields as needed for extensibility
  }).passthrough(), // Allow other fields for specific actions if needed
  options: z.object({
    // fetchExactMatch is no longer needed for a dedicated 'read' action for specific tickets.
    // It might be repurposed if 'find' evolves to support more complex queries.
    fetchExactMatch: z.boolean().optional(), // Flag to fetch a single specific ticket
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
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !apiToken) {
    appendJiraToolLog("[ERROR] getJiraEnv: Missing JIRA credentials in environment variables.");
    throw new Error("Missing JIRA credentials in environment variables");
  }
  appendJiraToolLog("[INFO] getJiraEnv: Credentials successfully retrieved from process.env.");
  return { baseUrl, email, apiToken };
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
  const url = `${baseUrl}/rest/api/3/issue/${issueKey}?fields=*all`; 
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
  appendJiraToolLog(`[INFO] getJiraTicketByKey: Successfully fetched details for ${issueKey}. Data size: ${JSON.stringify(ticketData).length}`);
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

export async function jiraToolHandler(input: JiraToolInput): Promise<JiraToolResult> {
  appendJiraToolLog(`[INFO] jiraToolHandler: Received action: ${input.action}, domain: ${input.domain}, context: ${JSON.stringify(input.context).substring(0,100)}...`);
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
        appendJiraToolLog(`[ERROR] jiraToolHandler (find_user): Error searching for user '${userQuery}': ${errorMsg}`);
        return {
          markdown: `❌ Error searching for JIRA user '${userQuery}': ${errorMsg}`,
          json: { error: errorMsg, query: userQuery },
        };
      }
    }
    default:
      appendJiraToolLog(`[ERROR] jiraToolHandler: Unsupported action/domain: Action=${input.action}, Domain=${input.domain}`);
      return {
        markdown: `❌ Error: The action '${input.action}' for domain '${input.domain}' is not supported or not implemented yet.`,
        json: { error: "Unsupported action/domain combination", action: input.action, domain: input.domain },
      };
  }
  appendJiraToolLog(`[ERROR] jiraToolHandler: Reached end of switch without valid action for Action=${input.action}, Domain=${input.domain}`);
  return {
    markdown: `❌ Error: Invalid path or unhandled scenario for action '${input.action}', domain '${input.domain}'.`,
    json: { error: "Invalid path or unhandled scenario", action: input.action, domain: input.domain },
  }; 
}

// Integration points:
// - Call this handler from project tools, passing project context
// - Store/read JIRA ticket metadata in data/projects/{project}/jira-tickets.json
// - Use prompt templates in src/prompts/templates_en/tools/jira/ (to be created) 