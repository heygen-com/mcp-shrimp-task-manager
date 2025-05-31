import { z } from "zod";
import axios from 'axios';

const SERVER_BASE_URL = 'http://localhost:9876';

// Define the structure of the expected log entry (adjust if needed)
interface LogEntry {
  type: string;
  timestamp: number;
  data: unknown;
  tabId?: number;
  url?: string;
  title?: string;
}

// Define the structure for the /tabs endpoint response
interface TabInfo {
  tabId: number;
  url: string;
  title: string;
  lastActivityTimestamp?: number;
}

// Define the unified schema
export const browserSchema = z.object({
  action: z.enum([
    "list_tabs",
    "check_logs"
  ]).describe("Action to perform"),
  
  // For check_logs action
  tabId: z.number().optional().describe("Specific tab ID to check logs for (optional - defaults to most recent)"),
}).describe("Unified browser tools - interact with MCP DevTools Bridge");

/**
 * Unified browser tool for interacting with MCP DevTools Bridge
 */
export async function browser(params: z.infer<typeof browserSchema>) {
  try {
    switch (params.action) {
      case "list_tabs": {
        try {
          const response = await axios.get(`${SERVER_BASE_URL}/cdp-tabs`);
          const tabs = response.data;
          
          if (!Array.isArray(tabs)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Received unexpected data format from the DevTools Bridge server (${SERVER_BASE_URL}/cdp-tabs). Expected an array of tab information. Please check the server logs.`,
                },
              ],
            };
          }
          
          if (tabs.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No active browser tabs are currently being monitored by the MCP DevTools Bridge server (at ${SERVER_BASE_URL}). To enable monitoring:\n1. Ensure the 'mcp-devtools-bridge' Chrome extension is installed and enabled.\n2. Open your target webpage and activate Chrome DevTools for that page.\n3. Within DevTools, locate the 'MCP Context' panel and ensure monitoring/recording is started for the tab.\n4. Verify the mcp-local-server (the bridge server itself) is running correctly.`,
                },
              ],
            };
          }
          
          // Return the list of tabs as a JSON string, with a reminder for the agent
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Tabs discovered (tabId, url, title):\n` +
                  JSON.stringify(tabs, null, 2) +
                  `\n\nAGENT: Select the correct tab for your context and REMEMBER the tabId for all future tool calls. NEVER ask the user for a tabId.`,
              },
            ],
          };
        } catch (error: unknown) {
          console.error('Error fetching tabs:', error);
          const message = error instanceof Error && typeof (error as { response?: { status?: number } }).response === 'object' && (error as { response?: { status?: number } }).response?.status === 404
            ? `DevTools Bridge server not found at ${SERVER_BASE_URL}/cdp-tabs.`
            : `Error fetching tabs: ${error instanceof Error ? error.message : String(error)}`;
          return {
            content: [
              {
                type: "text" as const,
                text: message,
              },
            ],
          };
        }
      }
      
      case "check_logs": {
        let tabs: TabInfo[] = [];
        let targetTabId: number;
        
        // If tabId was provided, use it directly
        if (params.tabId !== undefined) {
          targetTabId = params.tabId;
        } else {
          // Otherwise, fetch tabs and use the most recent one
          try {
            const tabsResponse = await axios.get<TabInfo[]>(`${SERVER_BASE_URL}/tabs`);
            tabs = tabsResponse.data;
            
            if (!Array.isArray(tabs)) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Received unexpected data format from the DevTools Bridge server (${SERVER_BASE_URL}/tabs). Expected an array of tab information. Please check the server logs.`,
                  },
                ],
              };
            }
            
            if (tabs.length === 0) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `No active browser tabs are currently being monitored by the MCP DevTools Bridge server (at ${SERVER_BASE_URL}). To enable monitoring:\n1. Ensure the 'mcp-devtools-bridge' Chrome extension is installed and enabled.\n2. Open your target webpage and activate Chrome DevTools for that page.\n3. Within DevTools, locate the 'MCP Context' panel (or similar, as described in architecture.md) and ensure monitoring/recording has been started or activated for the tab.\n4. Verify the mcp-local-server (the bridge server itself) is running correctly.`,
                  },
                ],
              };
            }
            
            // Find the tab with the latest activity
            // Sort descending by timestamp, handling potentially undefined timestamps
            tabs.sort((a, b) => (b.lastActivityTimestamp ?? 0) - (a.lastActivityTimestamp ?? 0));
            const latestTab = tabs[0];
            targetTabId = latestTab.tabId;
          } catch (error: unknown) {
            console.error('Error fetching tabs:', error);
            const message = error instanceof Error && typeof (error as { response?: { status?: number } }).response === 'object' && (error as { response?: { status?: number } }).response?.status === 404
              ? `DevTools Bridge server not found at ${SERVER_BASE_URL}/tabs.`
              : `Error fetching tabs: ${error instanceof Error ? error.message : String(error)}`;
            return {
              content: [
                {
                  type: "text" as const,
                  text: message,
                },
              ],
            };
          }
        }
        
        try {
          const logsResponse = await axios.get<LogEntry[]>(`${SERVER_BASE_URL}/logs`, {
            params: { tabId: targetTabId },
          });
          const logs = logsResponse.data;

          if (!Array.isArray(logs)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Invalid log data received from server for tab ${targetTabId}. Expected an array.`,
                },
              ],
            };
          }

          // Attempt to delete logs from the server after fetching them.
          // This ensures that the next call gets fresh logs.
          try {
            await axios.delete(`${SERVER_BASE_URL}/logs`, { params: { tabId: targetTabId } });
            console.log(`Successfully requested deletion of logs from server for tab ID: ${targetTabId}`);
          } catch (deleteError: unknown) {
            console.error(`Attempt to delete logs from server for tab ID ${targetTabId} failed: ${(deleteError as Error).message || deleteError}`);
            // Log the error, but proceed to return the fetched logs.
          }

          // Check for a "monitoring started" type message
          let monitoringStartedMessageFound = false;
          const monitoringKeywords = ["monitoring started", "logs started", "recording started", "browser context monitoring started"];
          for (const log of logs) {
            let messageText = '';
            if (typeof log.data === 'string') {
              messageText = log.data;
            } else if (log.data && typeof (log.data as { message?: unknown }).message === 'string') {
              messageText = (log.data as { message: string }).message;
            } else if (log.data && typeof (log.data as { text?: unknown }).text === 'string') {
              messageText = (log.data as { text: string }).text;
            } else if (log.data && Array.isArray((log.data as { args?: unknown[] }).args)) { // Check for console.log style args
              messageText = (log.data as { args: unknown[] }).args.join(' ');
            }

            if (messageText) {
              for (const keyword of monitoringKeywords) {
                if (messageText.toLowerCase().includes(keyword)) {
                  monitoringStartedMessageFound = true;
                  break;
                }
              }
            }
            if (monitoringStartedMessageFound) break;
          }

          const startupMessageInfo = monitoringStartedMessageFound
            ? "A 'monitoring started' type message was found in the logs."
            : "No specific 'monitoring started' type message was detected in the logs. This is informational and may not indicate an issue.";

          // Get tab info for display
          const tabInfo = tabs.find(t => t.tabId === targetTabId) || { url: 'unknown' };

          if (logs.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No logs found for tab (ID: ${targetTabId}, URL: ${tabInfo.url}). This might mean no new browser activity was captured or that monitoring isn't capturing events. Server-side logs for this tab ID were requested to be cleared. ${startupMessageInfo}`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: `Fetched ${logs.length} log entr(y|ies) for tab ID: ${targetTabId} (URL: ${tabInfo.url}).
${startupMessageInfo}
Logs (cleared from server after this fetch):
${JSON.stringify(logs, null, 2)}`,
              },
            ],
          };

        } catch (error: unknown) {
          console.error(`Error fetching logs for tab ${targetTabId}:`, error);
          const message = error instanceof Error && typeof (error as { response?: { status?: number } }).response === 'object' && (error as { response?: { status?: number } }).response?.status === 404
            ? `Log endpoint not found for tab ${targetTabId}. Is the server running and the tab ID correct?`
            : `Error fetching logs for tab ${targetTabId}: ${error instanceof Error ? error.message : String(error)}`;
          return {
            content: [
              {
                type: "text" as const,
                text: message,
              },
            ],
          };
        }
      }
      
      default:
        return {
          content: [{
            type: "text" as const,
            text: `❌ Unknown action: ${params.action}`
          }]
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{
        type: "text" as const,
        text: `Error in browser tool: ${errorMessage}`
      }]
    };
  }
} 