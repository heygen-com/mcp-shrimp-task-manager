# Learnings

2025-05-05: (TypeScript Build) Remember to run `npm run build` after editing .ts files before restarting the server. 

2025-05-06: (MCP Tool Error Handling & Response Structure)
*   **Problem:** Client/agent was receiving `Unexpected token 'R'...` errors, followed by Zod validation errors like `Expected string, received object at path: ["content", 0, "text"]`. This indicated the server was returning non-JSON responses when tools encountered errors.
*   **Root Cause (Server-Side):** 
    1.  Individual tools (in `src/tools/`) lacked consistent top-level `try...catch` blocks. Unhandled internal tool errors (e.g., from API calls, file system issues) propagated, causing the main server to send malformed (non-JSON) error responses.
    2.  The main tool request handler in `src/index.ts` was attempting to re-wrap tool results into a `content` array, e.g., `content: [{ type: 'text', text: result }]`. If a tool *correctly* returned `{ content: [...] }`, this led to a nested structure like `content: [{ type: 'text', text: { content: [...] } }]`, causing the `Expected string, received object` on the client.
*   **Solution (Server-Side):**
    1.  Ensured all tool functions (e.g., `planTask`, `consultExpert`, `checkBrowserLogs.execute`) have top-level `try...catch` blocks. These blocks now catch internal errors and explicitly return a well-formed MCP JSON response, typically `{ content: [{ type: "text", text: "Error: <message>" }] }`.
    2.  Modified `src/index.ts` in the `CallToolRequestSchema` handler to directly return/spread the result object from tools (e.g., `return { toolName: toolName, ...result };`). This relies on tools themselves returning the complete, correctly structured MCP response.
*   **Key Takeaway:** MCP tools should internally handle their errors and always return a valid MCP JSON response structure (including `content` array and optional `ephemeral` data or `error` object). The central request handler (`src/index.ts`) should trust tools to provide this structure and avoid re-wrapping, focusing on input validation and dispatch.
*   **Agent-Side Considerations Noted:**
    *   Agents must provide `taskId`s in the correct UUID format for tools like `consult_expert` (Zod validation in `src/index.ts` will reject otherwise).
    *   If `consult_expert` is called with a `taskId` for a non-existent task, it will warn and not persist advice. This is an agent workflow/task lifecycle consideration. 