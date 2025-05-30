import "dotenv/config";
import { jiraToolHandler } from "../src/tools/jiraTools.js";

const projectKeys = [
  "EP", // Enterprise Product
  "TT", // Tiger Team
  // Add more project keys here if needed, e.g. 'CP', 'FB' for Core Product, Feedback And bugs
];

console.log("JIRA_BASE_URL:", process.env.JIRA_BASE_URL);
console.log("JIRA_USER_EMAIL:", process.env.JIRA_USER_EMAIL);
console.log("JIRA_API_TOKEN (first 10 chars):", process.env.JIRA_API_TOKEN?.substring(0, 10));

async function run() {
  for (const projectKey of projectKeys) {
    console.log(`\n=== Testing projectKey: ${projectKey} ===`);
    try {
      const result = await jiraToolHandler({
        action: "create",
        domain: "ticket",
        context: {
          projectKey,
          summary: `Test ticket from MCP Shrimp test runner (${projectKey})`,
          description: `This is a test ticket created by the MCP Shrimp JIRA integration test runner for project ${projectKey}.`,
          labels: ["shrimp-system", "test"],
          metadata: {
            createdBy: "shrimp-tool",
            purpose: "integration-test-script",
            projectKey
          }
        }
      });
      console.log("--- Markdown Output ---\n" + result.markdown);
      console.log("--- JSON Output ---\n", result.json);
      if (result.url) {
        console.log("--- JIRA Ticket URL ---\n" + result.url);
      }
    } catch (err) {
      console.error(`Error for projectKey ${projectKey} (create):`, err);
    }
  }

  // Now test the 'find' action for each project
  for (const projectKey of projectKeys) {
    console.log(`\n=== Listing tickets assigned to you in projectKey: ${projectKey} ===`);
    try {
      const result = await jiraToolHandler({
        action: "find",
        domain: "ticket",
        context: {
          projectKey
        }
      });
      console.log("--- Markdown Output ---\n" + result.markdown);
      console.log("--- JSON Output ---\n", result.json);
    } catch (err) {
      console.error(`Error for projectKey ${projectKey} (find):`, err);
    }
  }

  // Test the 'find' action for all projects (no projectKey)
  console.log(`\n=== Listing tickets assigned to you in ALL projects ===`);
  try {
    const result = await jiraToolHandler({
      action: "find",
      domain: "ticket",
      context: {}
    });
    console.log("--- Markdown Output ---\n" + result.markdown);
    console.log("--- JSON Output ---\n", result.json);
  } catch (err) {
    console.error(`Error for all projects (find):`, err);
  }
}

run(); 