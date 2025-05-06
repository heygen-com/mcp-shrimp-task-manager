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

/**
 * Fetches the latest logs from the most recently active tab recorded by the MCP DevTools Bridge.
 */
export const checkBrowserLogs: Tool<typeof checkBrowserLogsSchema> = {
  name: 'check_browser_logs',
  description: `Fetches the latest ${DEFAULT_MAX_LOGS} console logs, network requests, or other events from the most recently active browser tab being monitored by the MCP DevTools Bridge server (running on ${SERVER_BASE_URL}). Useful for debugging web application issues.`, // Updated description
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

      // After successfully "reading" logs (even if empty), attempt to delete them from the server.
      try {
        await axios.delete(`${SERVER_BASE_URL}/logs`, { params: { tabId: targetTabId } });
        console.log(`Successfully requested deletion of logs from server for tab ID: ${targetTabId}`);
      } catch (deleteError: any) {
        console.error(`Attempt to delete logs from server for tab ID ${targetTabId} failed: ${deleteError.message || deleteError}`);
        // Log the error, but proceed to return the fetched logs.
        // The primary function is to return logs; deletion is a secondary cleanup.
      }

      // Get the latest logs from the fetched data to return to the user
      const latestLogs = logs.slice(-DEFAULT_MAX_LOGS);

      if (latestLogs.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No logs found for the most recent tab (ID: ${targetTabId}, URL: ${latestTab.url}). This might mean no new browser activity was captured since the last check, or that monitoring for this tab isn't capturing the specific events you're interested in. Server-side logs for this tab ID were requested to be cleared.`,
            },
          ],
        };
      }

      // Return the logs as a JSON string, wrapped in the content structure
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(latestLogs, null, 2),
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