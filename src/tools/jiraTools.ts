import "dotenv/config";
import { z } from "zod";
import fetch from "node-fetch";
import fs from "fs/promises";
import fsSync from 'fs';
import path from "path";

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
  action: z.enum(["create", "update", "read", "find", "list", "sync", "verify_credentials"]),
  domain: z.enum(["ticket", "project", "component", "migration"]),
  context: z.object({
    projectKey: z.string().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    labels: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    issueType: z.string().optional(), // Add support for issue type
    issueKey: z.string().optional(), // Added for finding specific ticket
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

// Helper to fetch a single JIRA ticket by its key with all fields
async function getJiraTicketByKey(issueKey: string): Promise<unknown> {
  appendJiraToolLog(`[INFO] getJiraTicketByKey: Attempting to fetch details for issue: ${issueKey}`);
  const { baseUrl, email, apiToken } = getJiraEnv();
  // Requesting all fields. Alternatively, specify a list of fields: &fields=summary,description,status,assignee,reporter,priority,labels,comment,issuelinks,subtasks,epic,created,updated,attachment
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
  
  const ticketData = await res.json();
  appendJiraToolLog(`[INFO] getJiraTicketByKey: Successfully fetched details for ${issueKey}. Data size: ${JSON.stringify(ticketData).length}`);
  return ticketData;
}

// Helper to format JIRA ticket JSON to Markdown
function formatJiraTicketToMarkdown(ticketData: any): string {
  if (!ticketData || !ticketData.key || !ticketData.fields) {
    return "# Invalid JIRA Ticket Data\n\nCould not format ticket details due to missing key information.";
  }

  const fields = ticketData.fields;
  const baseUrl = getJiraEnv().baseUrl; // Assuming getJiraEnv is available in this scope
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

  // Description (basic handling, ADF is complex)
  md += "\n## Description\n";
  if (fields.description) {
    // JIRA description is often in Atlassian Document Format (ADF)
    // For a simple markdown display, we might extract text content.
    // This is a placeholder for more sophisticated ADF to Markdown conversion if needed.
    if (typeof fields.description === 'string') {
      md += `${fields.description}\n`;
    } else if (fields.description.type === 'doc' && fields.description.content) {
      let descText = "";
      function extractTextFromAdf(node: any) {
        if (node.type === 'text') {
          descText += node.text;
        }
        if (node.content) {
          node.content.forEach(extractTextFromAdf);
        }
        if (node.type === 'paragraph') { // Add newlines for paragraphs
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

  // Sub-tasks
  if (fields.subtasks && fields.subtasks.length > 0) {
    md += "\n## Sub-tasks\n";
    fields.subtasks.forEach((subtask: any) => {
      md += `- [${subtask.key}](${baseUrl}/browse/${subtask.key}): ${subtask.fields?.summary || 'N/A'} (${subtask.fields?.status?.name || 'N/A'})\n`;
    });
  }

  // Issue Links (e.g., Epic, Parent)
  if (fields.issuelinks && fields.issuelinks.length > 0) {
    md += "\n## Linked Issues\n";
    const epicLinkType = fields.issuelinks.find((link: any) => link.type?.name === "Epic-Story Link" && link.inwardIssue);
    if (epicLinkType) {
      const epic = epicLinkType.inwardIssue;
      md += `**Epic:** [${epic.key}](${baseUrl}/browse/${epic.key}) - ${epic.fields?.summary || 'N/A'}\n`;
    }
    // Generic links (blocks, relates to, etc.)
    fields.issuelinks.forEach((link: any) => {
      if (link.type?.name !== "Epic-Story Link") {
        const direction = link.outwardIssue ? "outward" : "inward";
        const issue = link.outwardIssue || link.inwardIssue;
        if (issue) {
          md += `- ${link.type?.[direction + "Desc"] || link.type?.name}: [${issue.key}](${baseUrl}/browse/${issue.key}) - ${issue.fields?.summary || 'N/A'}\n`;
        }
      }
    });
  }
  
  // Comments (last 3)
  if (fields.comment && fields.comment.comments && fields.comment.comments.length > 0) {
    md += "\n## Comments\n";
    const comments = fields.comment.comments;
    const recentComments = comments.slice(-3); // Get last 3 comments
    recentComments.forEach((comment: any) => {
      md += `
**${comment.author?.displayName || "User"}** (${new Date(comment.created).toLocaleString()}):
`;
      // Basic ADF text extraction for comments too
      if (typeof comment.body === 'string') {
        md += `> ${comment.body.replace(/\\n/g, '\\n>')}\n`; // Basic blockquote
      } else if (comment.body?.type === 'doc' && comment.body?.content) {
        let commentText = "";
        function extractTextFromAdfComment(node: any) {
          if (node.type === 'text') commentText += node.text;
          if (node.content) node.content.forEach(extractTextFromAdfComment);
          if (node.type === 'paragraph') commentText += '\n';
        }
        comment.body.content.forEach(extractTextFromAdfComment);
        md += `> ${commentText.trim().replace(/\\n/g, '\\n>')}\n`;
      } else {
        md += "> Comment not in a recognizable format.\n";
      }
    });
  }

  // Attachments
  if (fields.attachment && fields.attachment.length > 0) {
    md += "\n## Attachments\n";
    fields.attachment.forEach((att: any) => {
      md += `- [${att.filename}](${att.content}) (${(att.size / 1024).toFixed(2)} KB)\n`;
    });
  }

  md += `\n---\n[View full ticket in JIRA](${ticketUrl})\n`;
  return md;
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
          const ticketData = await getJiraTicketByKey(issueKeyToFetch) as any; 
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
    // Add more cases for update, list, sync, etc.
    default:
      appendJiraToolLog(`[ERROR] jiraToolHandler: Unsupported action/domain: Action=${input.action}, Domain=${input.domain}`);
      throw new Error("Unsupported action/domain combination or not implemented yet.");
  }
  // Fallback error if a case doesn't return or throw (should ideally not be reached with comprehensive cases)
  appendJiraToolLog(`[ERROR] jiraToolHandler: Reached end of switch without valid action for Action=${input.action}, Domain=${input.domain}`);
  throw new Error("Not implemented yet or invalid action/domain for this path."); 
}

// Integration points:
// - Call this handler from project tools, passing project context
// - Store/read JIRA ticket metadata in data/projects/{project}/jira-tickets.json
// - Use prompt templates in src/prompts/templates_en/tools/jira/ (to be created) 