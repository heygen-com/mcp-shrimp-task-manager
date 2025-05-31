import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs'; // For file logging
import { fileURLToPath } from 'url'; // Needed for __dirname in ES Modules

const startupLogPath = '/tmp/mcp_shrimp_startup_debug.log';
let envResolutionLog = `Timestamp: ${new Date().toISOString()}\n`;

try {
  const __filename = fileURLToPath(import.meta.url);
  envResolutionLog += `__filename (import.meta.url): ${__filename}\n`;
  const __dirname = path.dirname(__filename);
  envResolutionLog += `__dirname (esm): ${__dirname}\n`;
  const projectRoot = path.resolve(__dirname, '..'); // Assumes dist is one level down from project root
  envResolutionLog += `projectRoot (resolved from __dirname): ${projectRoot}\n`;
  const resolvedEnvPath = path.resolve(projectRoot, '.env');
  envResolutionLog += `Attempting to load .env from: ${resolvedEnvPath}\n`;
  
  dotenv.config({ path: resolvedEnvPath });
  envResolutionLog += `dotenv.config() called for path: ${resolvedEnvPath}\n`;

} catch (e) {
  const errorMessage = (e instanceof Error) ? e.message : String(e);
  envResolutionLog += `Error during dotenv setup: ${errorMessage}\n`;
}

// Log JIRA env vars (or their absence) AFTER attempting to load .env
const jiraBaseUrl = process.env.JIRA_BASE_URL;
const jiraUserEmail = process.env.JIRA_USER_EMAIL;
const jiraApiTokenExists = !!process.env.JIRA_API_TOKEN;
envResolutionLog += `JIRA_BASE_URL: ${jiraBaseUrl}\nJIRA_USER_EMAIL: ${jiraUserEmail}\nJIRA_API_TOKEN_EXISTS: ${jiraApiTokenExists}\n---\n`;

// Add MCP-specific environment logging
envResolutionLog += `MCP Environment:\n`;
envResolutionLog += `DATA_DIR: ${process.env.DATA_DIR}\n`;
envResolutionLog += `ENABLE_THOUGHT_CHAIN: ${process.env.ENABLE_THOUGHT_CHAIN}\n`;
envResolutionLog += `TEMPLATES_USE: ${process.env.TEMPLATES_USE}\n`;
envResolutionLog += `ENABLE_GUI: ${process.env.ENABLE_GUI}\n`;
envResolutionLog += `Process argv: ${process.argv.join(' ')}\n`;
envResolutionLog += `Working directory: ${process.cwd()}\n`;
envResolutionLog += `---\n`;

try {
  fs.appendFileSync(startupLogPath, envResolutionLog);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
} catch (_err) {
  // Cannot use console.log here
}

import { loadPromptFromTemplate } from "./prompts/loader.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";
import getPort from "get-port";
import fsPromises from "fs/promises";
import { consultExpert, ConsultExpertInputSchema } from './tools/consult/consultExpertTool.js';
import { browser, browserSchema } from './tools/browser/unifiedBrowser.js';
import { queryMemories } from './models/memoryModel.js';
import { memories, memorySchema } from './tools/memory/unifiedMemory.js';
import {
  getMemoryChain,
} from './tools/memoryTool.js';
import {
  planTask,
  planTaskSchema,
  analyzeTask,
  analyzeTaskSchema,
  reflectTask,
  reflectTaskSchema,
  splitTasks,
  splitTasksSchema,
  listTasks,
  listTasksSchema,
  executeTask,
  executeTaskSchema,
  verifyTask,
  verifyTaskSchema,
  reportTaskResult,
  reportTaskResultSchema,
  completeTask,
  completeTaskSchema,
  deleteTask,
  deleteTaskSchema,
  clearAllTasks,
  clearAllTasksSchema,
  updateTaskContent,
  updateTaskContentSchema,
  queryTask,
  queryTaskSchema,
  getTaskDetail,
  getTaskDetailSchema,
  checkAgentStatus,
  checkAgentStatusSchema
} from "./tools/taskTools.js";
import { processThought, processThoughtSchema } from "./tools/chain/thoughtChainTools.js";
import { initProjectRules, initProjectRulesSchema } from "./tools/project/projectTools.js";
import { project, projectSchema } from "./tools/project/unifiedProject.js";
import { projectContext, projectContextSchema } from "./tools/project/projectContext.js";
import { logDataDir, logDataDirSchema, checkEnv, checkEnvSchema } from "./tools/debug/debugTools.js";
import { checkpoint, checkpointSchema } from "./tools/checkpoint/checkpointTool.js";
import { pullRequest, pullRequestSchema } from "./tools/pr/prAnalysisTools.js";
import { architectureSnapshot, architectureSnapshotSchema } from "./tools/architecture/architectureSnapshotTool.js";
import { JiraToolSchema, jiraToolHandler } from "./tools/jiraTools.js";
import { researchMode, researchModeSchema } from './tools/research/researchMode.js';

async function main() {
  try {
    const ENABLE_GUI = process.env.ENABLE_GUI === "true";

    if (ENABLE_GUI) {
      // 創建 Express 應用
      const app = express();

      // 儲存 SSE 客戶端的列表
      let sseClients: Response[] = [];
      let memorySSEClients: Response[] = [];

      // 發送 SSE 事件的輔助函數
      function sendSseUpdate() {
        sseClients.forEach((client) => {
          // 檢查客戶端是否仍然連接
          if (!client.writableEnded) {
            client.write(
              `event: update\ndata: ${JSON.stringify({
                timestamp: Date.now(),
              })}\n\n`
            );
          }
        });
        // 清理已斷開的客戶端 (可選，但建議)
        sseClients = sseClients.filter((client) => !client.writableEnded);
      }

      function sendMemoryUpdate() {
        memorySSEClients.forEach((client) => {
          if (!client.writableEnded) {
            client.write(
              `event: update\ndata: ${JSON.stringify({
                timestamp: Date.now(),
              })}\n\n`
            );
          }
        });
        memorySSEClients = memorySSEClients.filter((client) => !client.writableEnded);
      }

      // 設置靜態文件目錄
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const publicPath = path.join(__dirname, "public");
      const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
      const TASKS_FILE_PATH = path.join(DATA_DIR, "tasks.json"); // 提取檔案路徑
      const MEMORY_DIR = path.join(DATA_DIR, "memories");

      app.use(express.static(publicPath));

      // 設置 API 路由
      app.get("/api/tasks", async (req: Request, res: Response) => {
        try {
          // 使用 fsPromises 保持異步讀取
          const tasksData = await fsPromises.readFile(TASKS_FILE_PATH, "utf-8");
          res.json(JSON.parse(tasksData));
        } catch (error) {
          // 確保檔案不存在時返回空任務列表
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            res.json({ tasks: [] });
          } else {
            res.status(500).json({ error: "Failed to read tasks data" });
          }
        }
      });

      // 新增：SSE 端點
      app.get("/api/tasks/stream", (req: Request, res: Response) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          // 可選: CORS 頭，如果前端和後端不在同一個 origin
          // "Access-Control-Allow-Origin": "*",
        });

        // 發送一個初始事件或保持連接
        res.write("data: connected\n\n");

        // 將客戶端添加到列表
        sseClients.push(res);

        // 當客戶端斷開連接時，將其從列表中移除
        req.on("close", () => {
          sseClients = sseClients.filter((client) => client !== res);
        });
      });

      // Memory API endpoints
      app.get("/api/memories", async (req: Request, res: Response) => {
        try {
          const allMemories = await queryMemories({});
          res.json({ memories: allMemories });
        } catch (error) {
          console.error('Error loading memories:', error);
          res.status(500).json({ error: "Failed to load memories" });
        }
      });

      app.get("/api/memories/stream", (req: Request, res: Response) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        res.write("data: connected\n\n");
        memorySSEClients.push(res);

        req.on("close", () => {
          memorySSEClients = memorySSEClients.filter((client) => client !== res);
        });
      });

      app.get("/api/memories/:id/chain", async (req: Request, res: Response) => {
        try {
          const result = await getMemoryChain({ 
            memoryId: req.params.id, 
            depth: 3,
            includeContent: false 
          });
          // Parse the text response to extract chain data
          const chain: Array<{ id: string; type: string; summary: string }> = [];
          // TODO: Parse result.content[0].text to extract actual chain data
          // For now, return empty chain - the result contains formatted text that needs parsing
          console.log('Chain result received:', result.content[0].text.substring(0, 100));
          res.json({ chain });
        } catch (error) {
          console.error('Error getting memory chain:', error);
          res.status(500).json({ error: "Failed to get memory chain" });
        }
      });

      app.get("/api/memories/export", async (req: Request, res: Response) => {
        try {
          const format = req.query.format as string || 'json';
          const projectId = req.query.projectId as string || undefined;
          
          const result = await memories({
            action: 'export',
            format: format as 'json' | 'markdown',
            projectId,
            includeArchived: true
          });

          // Extract file path from result text
          const text = result.content[0].text;
          const pathMatch = text.match(/Exported \d+ memories to (.+)$/);
          if (pathMatch && pathMatch[1]) {
            const filePath = pathMatch[1];
            res.download(filePath);
          } else {
            res.status(500).json({ error: "Export failed" });
          }
        } catch (error) {
          console.error('Error exporting memories:', error);
          res.status(500).json({ error: "Failed to export memories" });
        }
      });

      // 獲取可用埠
      const port = await getPort();

      // 啟動 HTTP 伺服器
      const httpServer = app.listen(port, () => {
        // 在伺服器啟動後開始監聽檔案變化
        try {
          // 檢查檔案是否存在，如果不存在則不監聽 (避免 watch 報錯)
          if (fs.existsSync(TASKS_FILE_PATH)) {
            fs.watch(TASKS_FILE_PATH, (eventType, filename) => {
              if (
                filename &&
                (eventType === "change" || eventType === "rename")
              ) {
                // 稍微延遲發送，以防短時間內多次觸發 (例如編輯器保存)
                // debounce sendSseUpdate if needed
                sendSseUpdate();
              }
            });
          }

          // Watch memory files
          if (fs.existsSync(MEMORY_DIR)) {
            fs.watch(MEMORY_DIR, (eventType, filename) => {
              if (filename && (eventType === "change" || eventType === "rename")) {
                sendMemoryUpdate();
              }
            });
          }
        } catch { /* intentionally left blank */ }
      });

      // 將 URL 寫入 ebGUI.md
      try {
        const websiteUrl = `[Task Manager UI](http://localhost:${port})\n[Memory Explorer](http://localhost:${port}/memory-explorer.html)`;
        const websiteFilePath = path.join(DATA_DIR, "WebGUI.md");
        await fsPromises.writeFile(websiteFilePath, websiteUrl, "utf-8");
      } catch { /* intentionally left blank */ }

      // 設置進程終止事件處理 (確保移除 watcher)
      const shutdownHandler = async () => {
        // 關閉所有 SSE 連接
        sseClients.forEach((client) => client.end());
        sseClients = [];

        // 關閉 HTTP 伺服器
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        process.exit(0);
      };

      process.on("SIGINT", shutdownHandler);
      process.on("SIGTERM", shutdownHandler);
    }

    // 創建MCP服務器
    const server = new Server(
      {
        name: "Shrimp Task Manager",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Log MCP server creation
    fs.appendFileSync('/tmp/mcp_shrimp_startup_debug.log', 
      `\n[${new Date().toISOString()}] MCP Server created successfully\n`);

    // Restore setRequestHandler for ListTools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      fs.appendFileSync('/tmp/mcp_shrimp_startup_debug.log', 
        `[${new Date().toISOString()}] ListTools request received\n`);
      
      // Define the list of tools manually
      return {
        tools: [
          { name: "plan_task", description: loadPromptFromTemplate("toolsDescription/planTask.md"), inputSchema: zodToJsonSchema(planTaskSchema) },
          { name: "analyze_task", description: loadPromptFromTemplate("toolsDescription/analyzeTask.md"), inputSchema: zodToJsonSchema(analyzeTaskSchema) },
          { name: "reflect_task", description: loadPromptFromTemplate("toolsDescription/reflectTask.md"), inputSchema: zodToJsonSchema(reflectTaskSchema) },
          { name: "split_tasks", description: loadPromptFromTemplate("toolsDescription/splitTasks.md"), inputSchema: zodToJsonSchema(splitTasksSchema) },
          { name: "list_tasks", description: loadPromptFromTemplate("toolsDescription/listTasks.md"), inputSchema: zodToJsonSchema(listTasksSchema) },
          { name: "execute_task", description: loadPromptFromTemplate("toolsDescription/executeTask.md"), inputSchema: zodToJsonSchema(executeTaskSchema) },
          { name: "verify_task", description: loadPromptFromTemplate("toolsDescription/verifyTask.md"), inputSchema: zodToJsonSchema(verifyTaskSchema) },
          { name: "report_task_result", description: loadPromptFromTemplate("toolsDescription/reportTaskResult.md"), inputSchema: zodToJsonSchema(reportTaskResultSchema) },
          { name: "complete_task", description: loadPromptFromTemplate("toolsDescription/completeTask.md"), inputSchema: zodToJsonSchema(completeTaskSchema) },
          { name: "delete_task", description: loadPromptFromTemplate("toolsDescription/deleteTask.md"), inputSchema: zodToJsonSchema(deleteTaskSchema) },
          { name: "clear_all_tasks", description: loadPromptFromTemplate("toolsDescription/clearAllTasks.md"), inputSchema: zodToJsonSchema(clearAllTasksSchema) },
          { name: "update_task", description: loadPromptFromTemplate("toolsDescription/updateTask.md"), inputSchema: zodToJsonSchema(updateTaskContentSchema) },
          { name: "query_task", description: loadPromptFromTemplate("toolsDescription/queryTask.md"), inputSchema: zodToJsonSchema(queryTaskSchema) },
          { name: "get_task_detail", description: loadPromptFromTemplate("toolsDescription/getTaskDetail.md"), inputSchema: zodToJsonSchema(getTaskDetailSchema) },
          { name: "process_thought", description: loadPromptFromTemplate("toolsDescription/processThought.md"), inputSchema: zodToJsonSchema(processThoughtSchema) },
          { name: "init_project_rules", description: loadPromptFromTemplate("toolsDescription/initProjectRules.md"), inputSchema: zodToJsonSchema(initProjectRulesSchema) },
          { name: "project", description: "Unified project management tool. Actions: create (create new project), update (modify project), delete (remove project), list (show all projects), open (open project with context), generate_prompt (get project starter prompt), system_check (check system status), link_jira (link to JIRA epic), list_jira_projects (list JIRA projects). Use action parameter.", inputSchema: zodToJsonSchema(projectSchema) },
          { name: "project_context", description: "Project context management. Actions: add (add new context), search (find contexts), analyze (patterns/problem_solution_pairs/decisions/knowledge_graph), timeline (view history), export (save to file), summary (get overview), delete (remove contexts). Use action parameter.", inputSchema: zodToJsonSchema(projectContextSchema) },
          { name: "memories", description: "Unified memory management tool. Actions: record (save new memory), query (search memories), update (modify memory), delete (remove memory), maintenance (archive_old/decay_scores/get_stats), get_chain (get related memories), consolidate (merge duplicates), analytics (usage insights), export (save to file), import (load from file). Use action parameter.", inputSchema: zodToJsonSchema(memorySchema) },
          { name: "log_data_dir", description: "Logs the absolute path to the tasks.json file being used by the task manager.", inputSchema: zodToJsonSchema(logDataDirSchema) },
          { name: "consult_expert", description: loadPromptFromTemplate("toolsDescription/consultExpert.md"), inputSchema: zodToJsonSchema(ConsultExpertInputSchema) },
          { name: "check_agent_status", description: loadPromptFromTemplate("toolsDescription/checkAgentStatus.md"), inputSchema: zodToJsonSchema(checkAgentStatusSchema) },
          { name: "browser", description: "Unified browser tool - interact with MCP DevTools Bridge. Actions: list_tabs (show all monitored browser tabs), check_logs (fetch browser logs for a tab, optional tabId parameter defaults to most recent). Use action parameter.", inputSchema: zodToJsonSchema(browserSchema) },
          { name: "checkpoint", description: loadPromptFromTemplate("toolsDescription/checkpoint.md"), inputSchema: zodToJsonSchema(checkpointSchema) },
          { name: "pull_request", description: loadPromptFromTemplate("toolsDescription/analyzePR.md"), inputSchema: zodToJsonSchema(pullRequestSchema) },
          { name: "check_env", description: "Check environment variables available to the MCP server including GITHUB_TOKEN status", inputSchema: zodToJsonSchema(checkEnvSchema) },
          { name: "architecture_snapshot", description: "Architecture snapshot tool. Actions: create (analyze & document codebase), update (create new snapshot & compare), compare (diff two snapshots), list (show all snapshots). Options: depth, includeNodeModules, outputFormat. Use action parameter.", inputSchema: zodToJsonSchema(architectureSnapshotSchema) },
          { name: "jira", description: "Manages JIRA items. Actions: create (create tickets/epics), update (modify items), find (search items), list (show items), sync (sync with JIRA), verify_credentials (check auth). Domains: ticket, project, component, migration. Use action parameter.", inputSchema: zodToJsonSchema(JiraToolSchema) },
          { name: "research_mode", description: loadPromptFromTemplate("toolsDescription/researchMode.md"), inputSchema: zodToJsonSchema(researchModeSchema) },
        ],
      };
    });

    // Restore setRequestHandler for CallTool
    server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        let result;
        const toolName = request.params.name;

        try {
          if (!request.params.arguments) {
            throw new Error("No arguments provided");
          }

          let parsedArgs;

          switch (toolName) {
            case "plan_task":
              parsedArgs = await planTaskSchema.parseAsync(request.params.arguments);
              result = await planTask(parsedArgs);
              break;
            case "analyze_task":
              parsedArgs = await analyzeTaskSchema.parseAsync(request.params.arguments);
              result = await analyzeTask(parsedArgs);
              break;
            case "reflect_task":
              parsedArgs = await reflectTaskSchema.parseAsync(request.params.arguments);
              result = await reflectTask(parsedArgs);
              break;
            case "split_tasks":
              parsedArgs = await splitTasksSchema.parseAsync(request.params.arguments);
              result = await splitTasks(parsedArgs);
              break;
            case "list_tasks":
              parsedArgs = await listTasksSchema.parseAsync(request.params.arguments);
              result = await listTasks(parsedArgs);
              break;
            case "execute_task":
              parsedArgs = await executeTaskSchema.parseAsync(request.params.arguments);
              result = await executeTask(parsedArgs);
              break;
            case "verify_task":
              parsedArgs = await verifyTaskSchema.parseAsync(request.params.arguments);
              result = await verifyTask(parsedArgs);
              break;
            case "report_task_result":
              parsedArgs = await reportTaskResultSchema.parseAsync(request.params.arguments);
              result = await reportTaskResult(parsedArgs);
              break;
            case "complete_task":
              parsedArgs = await completeTaskSchema.parseAsync(request.params.arguments);
              result = await completeTask(parsedArgs);
              break;
            case "delete_task":
              parsedArgs = await deleteTaskSchema.parseAsync(request.params.arguments);
              result = await deleteTask(parsedArgs);
              break;
            case "clear_all_tasks":
              parsedArgs = await clearAllTasksSchema.parseAsync(request.params.arguments);
              result = await clearAllTasks(parsedArgs);
              break;
            case "update_task":
              parsedArgs = await updateTaskContentSchema.parseAsync(request.params.arguments);
              result = await updateTaskContent(parsedArgs);
              break;
            case "query_task":
              parsedArgs = await queryTaskSchema.parseAsync(request.params.arguments);
              result = await queryTask(parsedArgs);
              break;
            case "get_task_detail":
              parsedArgs = await getTaskDetailSchema.parseAsync(request.params.arguments);
              result = await getTaskDetail(parsedArgs);
              break;
            case "process_thought":
              parsedArgs = await processThoughtSchema.parseAsync(request.params.arguments);
              result = await processThought(parsedArgs);
              break;
            case "init_project_rules":
              parsedArgs = await initProjectRulesSchema.parseAsync(request.params.arguments || {});
              result = await initProjectRules();
              break;
            case "project":
              parsedArgs = await projectSchema.parseAsync(request.params.arguments);
              result = await project(parsedArgs);
              break;
            case "project_context":
              parsedArgs = await projectContextSchema.parseAsync(request.params.arguments);
              result = await projectContext(parsedArgs);
              break;
            case "memories":
              parsedArgs = await memorySchema.parseAsync(request.params.arguments);
              result = await memories(parsedArgs);
              break;
            case "log_data_dir":
              await logDataDirSchema.parseAsync(request.params.arguments || {});
              result = await logDataDir();
              break;
            case "consult_expert":
              parsedArgs = await ConsultExpertInputSchema.parseAsync(request.params.arguments);
              result = await consultExpert(parsedArgs);
              // Logging of result snippet removed for clarity, as 'result' is now an object
              break;
            case "check_agent_status":
              parsedArgs = await checkAgentStatusSchema.parseAsync(request.params.arguments || {}); 
              result = await checkAgentStatus();
              break;  
            case "browser":
              parsedArgs = await browserSchema.parseAsync(request.params.arguments);
              result = await browser(parsedArgs);
              break;
            case "checkpoint":
              parsedArgs = await checkpointSchema.parseAsync(request.params.arguments);
              result = await checkpoint(parsedArgs);
              break;
            case "pull_request":
              parsedArgs = await pullRequestSchema.parseAsync(request.params.arguments);
              result = await pullRequest(parsedArgs);
              break;
            case "check_env":
              await checkEnvSchema.parseAsync(request.params.arguments || {});
              result = await checkEnv();
              break;
            case "architecture_snapshot":
              parsedArgs = await architectureSnapshotSchema.parseAsync(request.params.arguments);
              result = await architectureSnapshot(parsedArgs);
              break;
            case "jira": {
              parsedArgs = await JiraToolSchema.parseAsync(request.params.arguments);
              const jiraResult = await jiraToolHandler(parsedArgs);
              const contentItems = [];
              if (jiraResult.markdown) {
                // Present markdown as plain text for now
                contentItems.push({ type: 'text', text: jiraResult.markdown });
              }
              if (jiraResult.json) {
                // Present stringified JSON as plain text
                contentItems.push({ type: 'text', text: `JSON Data:\n${JSON.stringify(jiraResult.json, null, 2)}` });
              }
              if (jiraResult.url) {
                contentItems.push({ type: 'text', text: `Relevant URL: ${jiraResult.url}` });
              }
              // If no specific content, provide a default message
              if (contentItems.length === 0) {
                contentItems.push({ type: 'text', text: 'JIRA tool executed, no specific markdown, JSON, or URL output produced.'});
              }
              result = { content: contentItems }; 
              break;
            }
            case "research_mode": {
              parsedArgs = await researchModeSchema.parseAsync(request.params.arguments);
              result = await researchMode(parsedArgs);
              break;
            }
            default:
              // Log the tool name and arguments for debugging
              console.error(`Unknown tool: ${toolName}`);
              throw new Error(`Tool ${toolName} does not exist`);
          }

          // Return the result directly from the tool, assuming it's correctly structured
          return {
            toolName: toolName,
            ...result // Spread the properties of result (e.g., content, ephemeral)
          };

        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.error(`Error calling tool ${toolName}:`, errorMsg);

          // Return the error with content array at the TOP level
          const errorText = `Error occurred: ${errorMsg} \n Please check arguments and try again.`;
          return {
             toolName: toolName,
             // Include an error field at the top level
             error: { message: errorMsg },
             // Also include the content array at the top level
             content: [{ type: 'text', text: errorText }],
          };
        }
      }
    );

    // 建立連接
    const transport = new StdioServerTransport();
    
    fs.appendFileSync('/tmp/mcp_shrimp_startup_debug.log', 
      `[${new Date().toISOString()}] Attempting to connect via StdioServerTransport...\n`);
    
    await server.connect(transport);
    
    fs.appendFileSync('/tmp/mcp_shrimp_startup_debug.log', 
      `[${new Date().toISOString()}] MCP Server connected successfully!\n`);

  } catch (error) {
    // Log fatal startup errors to console/stderr
    console.error("[FATAL] Server failed to start:", error);
    fs.appendFileSync('/tmp/mcp_shrimp_startup_debug.log', 
      `[${new Date().toISOString()}] FATAL ERROR: ${error}\n`);
    process.exit(1);
  }
}

main().catch(console.error);
