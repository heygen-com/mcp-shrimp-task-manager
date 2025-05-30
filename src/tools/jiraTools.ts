import "dotenv/config";
import { z } from "zod";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";

// Zod schema for the JIRA tool input
export const JiraToolSchema = z.object({
  action: z.enum(["create", "update", "find", "list", "sync"]),
  domain: z.enum(["ticket", "project", "component", "migration"]),
  context: z.object({
    projectKey: z.string().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    labels: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    // Add more fields as needed for extensibility
  }),
  options: z.object({}).passthrough().optional(), // For future extensibility
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
    throw new Error("Missing JIRA credentials in environment variables");
  }
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

export async function jiraToolHandler(input: JiraToolInput): Promise<JiraToolResult> {
  switch (input.action) {
    case "create":
      if (input.domain === "ticket") {
        const { projectKey, summary, metadata } = input.context;
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
    case "find":
      if (input.domain === "ticket") {
        const projectKey = input.context.projectKey || '';
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
    // Add more cases for update, list, sync, etc.
    default:
      throw new Error("Unsupported action/domain combination");
  }
  throw new Error("Not implemented");
}

// Integration points:
// - Call this handler from project tools, passing project context
// - Store/read JIRA ticket metadata in data/projects/{project}/jira-tickets.json
// - Use prompt templates in src/prompts/templates_en/tools/jira/ (to be created) 