import "dotenv/config";
import { loadPromptFromTemplate } from "./prompts/loader.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response, NextFunction } from "express";
import getPort from "get-port";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { fileURLToPath } from "url";
import { consultExpert, ConsultExpertInputSchema } from './tools/consultExpertTool.js';
import { checkBrowserLogs, checkBrowserLogsSchema } from './tools/browserTools.js';
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
import { processThought, processThoughtSchema } from "./tools/thoughtChainTools.js";
import { initProjectRules, initProjectRulesSchema } from "./tools/projectTools.js";
import { logDataDir, logDataDirSchema } from "./tools/debugTools.js";

async function main() {
  try {
    const ENABLE_GUI = process.env.ENABLE_GUI === "true";

    if (ENABLE_GUI) {
      // 創建 Express 應用
      const app = express();

      // 儲存 SSE 客戶端的列表
      let sseClients: Response[] = [];

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

      // 設置靜態文件目錄
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const publicPath = path.join(__dirname, "public");
      const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
      const TASKS_FILE_PATH = path.join(DATA_DIR, "tasks.json"); // 提取檔案路徑

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
        } catch (watchError) {}
      });

      // 將 URL 寫入 ebGUI.md
      try {
        const websiteUrl = `[Task Manager UI](http://localhost:${port})`;
        const websiteFilePath = path.join(DATA_DIR, "WebGUI.md");
        await fsPromises.writeFile(websiteFilePath, websiteUrl, "utf-8");
      } catch (error) {}

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

    // Restore setRequestHandler for ListTools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
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
          { name: "log_data_dir", description: "Logs the absolute path to the tasks.json file being used by the task manager.", inputSchema: zodToJsonSchema(logDataDirSchema) },
          { name: "consult_expert", description: loadPromptFromTemplate("toolsDescription/consultExpert.md"), inputSchema: zodToJsonSchema(ConsultExpertInputSchema) },
          { name: "check_agent_status", description: loadPromptFromTemplate("toolsDescription/checkAgentStatus.md"), inputSchema: zodToJsonSchema(checkAgentStatusSchema) },
          { name: "check_browser_logs", description: checkBrowserLogs.description, inputSchema: zodToJsonSchema(checkBrowserLogsSchema) },
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
              // Assuming initProjectRules takes no args or handles undefined
              result = await initProjectRules(); 
              break;
            case "log_data_dir":
              // Assuming logDataDir takes no args or handles undefined
              result = await logDataDir();
              break;
            case "consult_expert":
              parsedArgs = await ConsultExpertInputSchema.parseAsync(request.params.arguments);
              result = await consultExpert(parsedArgs);
              // Limit log length for potentially long results
              // Use type assertion to fix TS error
              const resultSnippet = typeof result === 'string' 
                ? (result as string).substring(0, 200) + ((result as string).length > 200 ? '...' : '') 
                : JSON.stringify(result);
              break;
            case "check_agent_status":
              parsedArgs = await checkAgentStatusSchema.parseAsync(request.params.arguments || {}); 
              result = await checkAgentStatus();
              break;  
            case "check_browser_logs":
              parsedArgs = await checkBrowserLogsSchema.parseAsync(request.params.arguments || {}); // Accepts empty object
              result = await checkBrowserLogs.execute(parsedArgs); // Call the execute method
              break;
            default:
              throw new Error(`Tool ${toolName} does not exist`);
          }

          // Return the result
          // Ensure the tool's execute function returns the data in the expected format 
          // (likely just the stringified JSON logs in this case)
          return {
            toolName: toolName,
            content: [{ type: 'text', text: result }], // Wrap result in standard content structure
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
    await server.connect(transport);

  } catch (error) {
    // Log fatal startup errors to console/stderr
    console.error("[FATAL] Server failed to start:", error);
    process.exit(1);
  }
}

main().catch(console.error);
