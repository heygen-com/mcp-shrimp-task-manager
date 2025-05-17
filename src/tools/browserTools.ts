import { z } from 'zod';
import axios from 'axios';
// @ts-ignore - TS compiler requires no extension here, despite NodeNext rule
import type { Tool } from '../types';

const DEFAULT_MAX_LOGS = 25;
const SERVER_BASE_URL = 'http://localhost:9876';

// Define the schema for the tool's input (no parameters)
export const checkBrowserLogsSchema = z.object({});

// Define the structure of the expected log entry (adjust if needed)
interface LogEntry {
  type: string;
  timestamp: number;
  data: any;
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

// Define the schema for the tab discovery tool (no input required)
export const listBrowserTabsSchema = z.object({});

/**
 * Fetches all available console logs, network requests, or other events for the most recently active browser tab from the MCP DevTools Bridge server (running on ${SERVER_BASE_URL}). Logs are cleared from the server after being fetched. Useful for debugging web application issues, especially for capturing an initial snapshot of browser activity.
 */
export const checkBrowserLogs: Tool<typeof checkBrowserLogsSchema> = {
  name: 'check_browser_logs',
  description: `Fetches all available console logs, network requests, or other events for the most recently active browser tab from the MCP DevTools Bridge server (running on ${SERVER_BASE_URL}). Logs are cleared from the server after being fetched. Useful for debugging web application issues, especially for capturing an initial snapshot of browser activity.`,
  schema: checkBrowserLogsSchema,
  execute: async () => {
    let tabs: TabInfo[] = [];
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
    } catch (error: any) {
      console.error('Error fetching tabs:', error);
      const message = axios.isAxiosError(error) && error.response?.status === 404
        ? `DevTools Bridge server not found at ${SERVER_BASE_URL}/tabs.`
        : `Error fetching tabs: ${error.message}`;
      return {
        content: [
          {
            type: "text" as const,
            text: message,
          },
        ],
      };
    }

    // Find the tab with the latest activity
    // Sort descending by timestamp, handling potentially undefined timestamps
    tabs.sort((a, b) => (b.lastActivityTimestamp ?? 0) - (a.lastActivityTimestamp ?? 0));
    const latestTab = tabs[0];
    const targetTabId = latestTab.tabId;

    try {
      const logsResponse = await axios.get<LogEntry[]>(`${SERVER_BASE_URL}/logs`, {
        params: { tabId: targetTabId },
      });
      let logs = logsResponse.data;

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
      } catch (deleteError: any) {
        console.error(`Attempt to delete logs from server for tab ID ${targetTabId} failed: ${deleteError.message || deleteError}`);
        // Log the error, but proceed to return the fetched logs.
      }

      // Check for a "monitoring started" type message
      let monitoringStartedMessageFound = false;
      const monitoringKeywords = ["monitoring started", "logs started", "recording started", "browser context monitoring started"];
      for (const log of logs) {
        let messageText = '';
        if (typeof log.data === 'string') {
          messageText = log.data;
        } else if (log.data && typeof log.data.message === 'string') {
          messageText = log.data.message;
        } else if (log.data && typeof log.data.text === 'string') {
          messageText = log.data.text;
        } else if (log.data && Array.isArray(log.data.args)) { // Check for console.log style args
            messageText = log.data.args.join(' ');
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


      if (logs.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No logs found for the most recent tab (ID: ${targetTabId}, URL: ${latestTab.url}). This might mean no new browser activity was captured or that monitoring isn't capturing events. Server-side logs for this tab ID were requested to be cleared. ${startupMessageInfo}`,
            },
          ],
        };
      }

      // Return all fetched logs
      const returnedLogs = logs; // No longer slicing with DEFAULT_MAX_LOGS

      return {
        content: [
          {
            type: "text" as const,
            text: `Fetched ${returnedLogs.length} log entr(y|ies) for tab ID: ${targetTabId} (URL: ${latestTab.url}).
${startupMessageInfo}
Logs (cleared from server after this fetch):
${JSON.stringify(returnedLogs, null, 2)}`,
          },
        ],
      };

    } catch (error: any) {
      console.error(`Error fetching logs for tab ${targetTabId}:`, error);
       const message = axios.isAxiosError(error) && error.response?.status === 404
        ? `Log endpoint not found for tab ${targetTabId}. Is the server running and the tab ID correct?`
        : `Error fetching logs for tab ${targetTabId}: ${error.message}`;
       return {
        content: [
          {
            type: "text" as const,
            text: message,
          },
        ],
      };
    }
  },
};

/**
 * Lists all open browser tabs monitored by the MCP DevTools Bridge.
 *
 * Usage Instructions for Agents:
 * - Use this tool to get all open browser tabs (tabId, url, title).
 * - Select the most relevant tab for your context based on URL/title.
 * - NEVER ask the user for a tabId; always select it yourself.
 * - You MUST remember the selected tabId for use in all future requests (e.g., for localStorage, cookies, logs, etc.).
 * - If no tabs are found, follow the instructions in the response to enable monitoring.
 */
export const listBrowserTabs: Tool<typeof listBrowserTabsSchema> = {
  name: 'list_browser_tabs',
  description: `Lists all open browser tabs (tabId, url, title) currently monitored by the MCP DevTools Bridge server (at ${SERVER_BASE_URL}/cdp-tabs).\n\nAGENT INSTRUCTIONS:\n- Use this tool to discover all open tabs.\n- Select the correct tab for your context based on URL/title.\n- NEVER ask the user for a tabId.\n- You MUST remember the selected tabId for all future tool calls that require it.\n- If no tabs are found, follow the instructions in the response to enable monitoring.`,
  schema: listBrowserTabsSchema,
  execute: async () => {
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
    } catch (error: any) {
      console.error('Error fetching tabs:', error);
      const message = axios.isAxiosError(error) && error.response?.status === 404
        ? `DevTools Bridge server not found at ${SERVER_BASE_URL}/cdp-tabs.`
        : `Error fetching tabs: ${error.message}`;
      return {
        content: [
          {
            type: "text" as const,
            text: message,
          },
        ],
      };
    }
  },
}; 