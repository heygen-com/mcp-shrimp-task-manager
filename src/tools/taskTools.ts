import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";
import {
  getAllTasks,
  getTaskById,
  canExecuteTask,
  batchCreateOrUpdateTasks,
  deleteTask as modelDeleteTask,
  updateTaskSummary,
  assessTaskComplexity,
  clearAllTasks as modelClearAllTasks,
  searchTasksWithCommand,
  startTaskAttempt,
  recordTaskAttemptResult,
  detectTaskLoop,
} from "../models/taskModel.js";
import {
  TaskStatus,
  TaskComplexityLevel,
  RelatedFileType,
  Task,
} from "../types/index.js";
import {
  generateTaskSummary,
} from "../utils/summaryExtractor.js";
import { loadTaskRelatedFiles } from "../utils/fileLoader.js";
// 導入prompt生成器
import {
  getPlanTaskPrompt,
  getAnalyzeTaskPrompt,
  getReflectTaskPrompt,
  getSplitTasksPrompt,
  getExecuteTaskPrompt,
  getVerifyTaskPrompt,
  getCompleteTaskPrompt,
  getListTasksPrompt,
  getQueryTaskPrompt,
  getGetTaskDetailPrompt,
  getDeleteTaskPrompt,
  getClearAllTasksPrompt,
  getUpdateTaskContentPrompt,
} from "../prompts/index.js";
import { loadPromptFromTemplate, generatePrompt } from "../prompts/loader.js";

// 開始規劃工具
export const planTaskSchema = z.object({
  description: z
    .string()
    .min(10, {
      message: "任務描述不能少於10個字符，請提供更詳細的描述以確保任務目標明確",
    })
    .describe("完整詳細的任務問題描述，應包含任務目標、背景及預期成果"),
  requirements: z
    .string()
    .optional()
    .describe("任務的特定技術要求、業務約束條件或品質標準（選填）"),
  existingTasksReference: z
    .boolean()
    .optional()
    .default(false)
    .describe("是否參考現有任務作為規劃基礎，用於任務調整和延續性規劃"),
});

export async function planTask({
  description,
  requirements,
  existingTasksReference = false,
}: z.infer<typeof planTaskSchema>) {
  try {
    // 獲取基礎目錄路徑
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const PROJECT_ROOT = path.resolve(__dirname, "../..");
    const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, "data");
    const MEMORY_DIR = path.join(DATA_DIR, "memory");

    // 準備所需參數
    let completedTasks: Task[] = [];
    let pendingTasks: Task[] = [];

    // 當 existingTasksReference 為 true 時，從數據庫中載入所有任務作為參考
    if (existingTasksReference) {
      try {
        const allTasks = await getAllTasks();

        // 將任務分為已完成和未完成兩類
        completedTasks = allTasks.filter(
          (task) => task.status === TaskStatus.COMPLETED
        );
        pendingTasks = allTasks.filter(
          (task) => task.status !== TaskStatus.COMPLETED
        );
      } catch (error) {
        console.error('Error fetching tasks for planTask:', error); // Log the error
        // Optionally, re-throw or handle as a critical failure for planning if tasks are essential
        // For now, we allow planning to proceed with empty tasks if fetching fails, but it's logged.
      }
    }

    // 使用prompt生成器獲取最終prompt
    const prompt = getPlanTaskPrompt({
      description,
      requirements,
      existingTasksReference,
      completedTasks,
      pendingTasks,
      memoryDir: MEMORY_DIR,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: prompt,
        },
      ],
    };
  } catch (error: unknown) {
    console.error('Error in planTask tool:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during task planning.';
    return {
      content: [
        {
          type: "text" as const,
          text: `Error during task planning: ${errorMessage}`,
        },
      ],
    };
  }
}

// 分析問題工具
export const analyzeTaskSchema = z.object({
  summary: z
    .string()
    .min(10, {
      message: "任務摘要不能少於10個字符，請提供更詳細的描述以確保任務目標明確",
    })
    .describe(
      "結構化的任務摘要，包含任務目標、範圍與關鍵技術挑戰，最少10個字符"
    ),
  initialConcept: z
    .string()
    .min(50, {
      message:
        "初步解答構想不能少於50個字符，請提供更詳細的內容確保技術方案清晰",
    })
    .describe(
      "最少50個字符的初步解答構想，包含技術方案、架構設計和實施策略，如果需要提供程式碼請使用 pseudocode 格式且僅提供高級邏輯流程和關鍵步驟避免完整代碼"
    ),
  previousAnalysis: z
    .string()
    .optional()
    .describe("前次迭代的分析結果，用於持續改進方案（僅在重新分析時需提供）"),
});

export async function analyzeTask({
  summary,
  initialConcept,
  previousAnalysis,
}: z.infer<typeof analyzeTaskSchema>) {
  // 使用prompt生成器獲取最終prompt
  const prompt = getAnalyzeTaskPrompt({
    summary,
    initialConcept,
    previousAnalysis,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
  };
}

// 反思構想工具
export const reflectTaskSchema = z.object({
  summary: z
    .string()
    .min(10, {
      message: "任務摘要不能少於10個字符，請提供更詳細的描述以確保任務目標明確",
    })
    .describe("結構化的任務摘要，保持與分析階段一致以確保連續性"),
  analysis: z
    .string()
    .min(100, {
      message: "技術分析內容不夠詳盡，請提供完整的技術分析和實施方案",
    })
    .describe(
      "完整詳盡的技術分析結果，包括所有技術細節、依賴組件和實施方案，如果需要提供程式碼請使用 pseudocode 格式且僅提供高級邏輯流程和關鍵步驟避免完整代碼"
    ),
});

export async function reflectTask({
  summary,
  analysis,
}: z.infer<typeof reflectTaskSchema>) {
  // 使用prompt生成器獲取最終prompt
  const prompt = getReflectTaskPrompt({
    summary,
    analysis,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
  };
}

// 拆分任務工具
export const splitTasksSchema = z.object({
  updateMode: z
    .enum(["append", "overwrite", "selective", "clearAllTasks"])
    .describe(
      "任務更新模式選擇：'append'(保留所有現有任務並添加新任務)、'overwrite'(清除所有未完成任務並完全替換，保留已完成任務)、'selective'(智能更新：根據任務名稱匹配更新現有任務，保留不在列表中的任務，推薦用於任務微調)、'clearAllTasks'(清除所有任務並創建備份)。\n預設為'clearAllTasks'模式，只有用戶要求變更或修改計劃內容才使用其他模式"
    ),
  tasks: z
    .array(
      z.object({
        name: z
          .string()
          .max(100, {
            message: "任務名稱過長，請限制在100個字符以內",
          })
          .describe("簡潔明確的任務名稱，應能清晰表達任務目的"),
        description: z
          .string()
          .min(10, {
            message: "任務描述過短，請提供更詳細的內容以確保理解",
          })
          .describe("詳細的任務描述，包含實施要點、技術細節和驗收標準"),
        implementationGuide: z
          .string()
          .describe(
            "此特定任務的具體實現方法和步驟，請參考之前的分析結果提供精簡pseudocode"
          ),
        dependencies: z
          .array(z.string())
          .optional()
          .describe(
            "此任務依賴的前置任務ID或任務名稱列表，支持兩種引用方式，名稱引用更直觀，是一個字串陣列"
          ),
        notes: z
          .string()
          .optional()
          .describe("補充說明、特殊處理要求或實施建議（選填）"),
        relatedFiles: z
          .array(
            z.object({
              path: z
                .string()
                .min(1, {
                  message: "文件路徑不能為空",
                })
                .describe("文件路徑，可以是相對於項目根目錄的路徑或絕對路徑"),
              type: z
                .nativeEnum(RelatedFileType)
                .describe(
                  "文件類型 (TO_MODIFY: 待修改, REFERENCE: 參考資料, CREATE: 待建立, DEPENDENCY: 依賴文件, OTHER: 其他)"
                ),
              description: z
                .string()
                .min(1, {
                  message: "文件描述不能為空",
                })
                .describe("文件描述，用於說明文件的用途和內容"),
              lineStart: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("相關代碼區塊的起始行（選填）"),
              lineEnd: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("相關代碼區塊的結束行（選填）"),
            })
          )
          .optional()
          .describe(
            "與任務相關的文件列表，用於記錄與任務相關的代碼文件、參考資料、要建立的文件等（選填）"
          ),
        verificationCriteria: z
          .string()
          .optional()
          .describe("此特定任務的驗證標準和檢驗方法"),
      })
    )
    .min(1, {
      message: "請至少提供一個任務",
    })
    .describe(
      "結構化的任務清單，每個任務應保持原子性且有明確的完成標準，避免過於簡單的任務，簡單修改可與其他任務整合，避免任務過多"
    ),
  globalAnalysisResult: z
    .string()
    .optional()
    .describe(
      "全局分析結果：來自 reflect_task 的完整分析結果，適用於所有任務的通用部分"
    ),
});

export async function splitTasks({
  updateMode,
  tasks,
  globalAnalysisResult,
}: z.infer<typeof splitTasksSchema>) {
  try {
    // 檢查 tasks 裡面的 name 是否有重複
    const nameSet = new Set();
    for (const task of tasks) {
      if (nameSet.has(task.name)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "tasks 參數中存在重複的任務名稱，請確保每個任務名稱是唯一的",
            },
          ],
        };
      }
      nameSet.add(task.name);
    }

    // 根據不同的更新模式處理任務
    let message = "";
    let actionSuccess = true;
    let backupFile = null;
    let createdTasks: Task[] = [];
    let allTasks: Task[] = [];

    // 將任務資料轉換為符合batchCreateOrUpdateTasks的格式
    const convertedTasks = tasks.map((task) => ({
      name: task.name,
      description: task.description,
      notes: task.notes,
      dependencies: task.dependencies,
      implementationGuide: task.implementationGuide,
      verificationCriteria: task.verificationCriteria,
      relatedFiles: task.relatedFiles?.map((file) => ({
        path: file.path,
        type: file.type as RelatedFileType,
        description: file.description,
        lineStart: file.lineStart,
        lineEnd: file.lineEnd,
      })),
    }));

    // 處理 clearAllTasks 模式
    if (updateMode === "clearAllTasks") {
      const clearResult = await modelClearAllTasks();

      if (clearResult.success) {
        message = clearResult.message;
        backupFile = clearResult.backupFile;

        try {
          // 清空任務後再創建新任務
          createdTasks = await batchCreateOrUpdateTasks(
            convertedTasks,
            "append",
            globalAnalysisResult
          );
          message += `\n成功創建了 ${createdTasks.length} 個新任務。`;
        } catch (error) {
          actionSuccess = false;
          message += `\n創建新任務時發生錯誤: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      } else {
        actionSuccess = false;
        message = clearResult.message;
      }
    } else {
      // 對於其他模式，直接使用 batchCreateOrUpdateTasks
      try {
        createdTasks = await batchCreateOrUpdateTasks(
          convertedTasks,
          updateMode,
          globalAnalysisResult
        );

        // 根據不同的更新模式生成消息
        switch (updateMode) {
          case "append":
            message = `成功追加了 ${createdTasks.length} 個新任務。`;
            break;
          case "overwrite":
            message = `成功清除未完成任務並創建了 ${createdTasks.length} 個新任務。`;
            break;
          case "selective":
            message = `成功選擇性更新/創建了 ${createdTasks.length} 個任務。`;
            break;
        }
      } catch (error) {
        actionSuccess = false;
        message = `任務創建失敗：${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }

    // 獲取所有任務用於顯示依賴關係
    try {
      allTasks = await getAllTasks();
    } catch {
      allTasks = [...createdTasks]; // 如果獲取失敗，至少使用剛創建的任務
    }

    // 使用prompt生成器獲取最終prompt
    const prompt = getSplitTasksPrompt({
      updateMode,
      createdTasks,
      allTasks,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: prompt,
        },
      ],
      ephemeral: {
        taskCreationResult: {
          success: actionSuccess,
          message,
          backupFilePath: backupFile,
        },
      },
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            "執行任務拆分時發生錯誤: " +
            (error instanceof Error ? error.message : String(error)),
        },
      ],
    };
  }
}

export const listTasksSchema = z.object({
  status: z
    .enum(["all", "pending", "in_progress", "completed"])
    .describe("要列出的任務狀態，可選擇 'all' 列出所有任務，或指定具體狀態"),
});

// 列出任務工具
export async function listTasks({ status }: z.infer<typeof listTasksSchema>) {
  const tasks = await getAllTasks();
  let filteredTasks = tasks;
  switch (status) {
    case "all":
      break;
    case "pending":
      filteredTasks = tasks.filter(
        (task) => task.status === TaskStatus.PENDING
      );
      break;
    case "in_progress":
      filteredTasks = tasks.filter(
        (task) => task.status === TaskStatus.IN_PROGRESS
      );
      break;
    case "completed":
      filteredTasks = tasks.filter(
        (task) => task.status === TaskStatus.COMPLETED
      );
      break;
  }

  if (filteredTasks.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統通知\n\n目前系統中沒有${
            status === "all" ? "任何" : `任何 ${status} 的`
          }任務。請查詢其他狀態任務或先使用「split_tasks」工具創建任務結構，再進行後續操作。`,
        },
      ],
    };
  }

  const tasksByStatus = tasks.reduce((acc, task) => {
    if (!acc[task.status]) {
      acc[task.status] = [];
    }
    acc[task.status].push(task);
    return acc;
  }, {} as Record<string, typeof tasks>);

  // 使用prompt生成器獲取最終prompt
  const prompt = getListTasksPrompt({
    status,
    tasks: tasksByStatus,
    allTasks: filteredTasks,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
  };
}

// 執行任務工具
export const executeTaskSchema = z.object({
  taskId: z
    .string()
    .uuid({
      message: "任務ID必須是有效的UUID格式",
    })
    .describe("待執行任務的唯一標識符，必須是系統中存在的有效任務ID"),
});

export async function executeTask({
  taskId,
}: z.infer<typeof executeTaskSchema>) {
  // 開始執行任務邏輯
  const task = await getTaskById(taskId);

  // 檢查任務是否存在
  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統錯誤\n\n找不到ID為 '${taskId}' 的任務。請檢查任務ID是否正確。`,
        },
      ],
    };
  }

  // 檢查任務狀態是否允許執行
  if (task.status === TaskStatus.COMPLETED) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統通知\n\n任務 '${task.name}' (ID: ${taskId}) 已經完成，無需再次執行。`,
        },
      ],
    };
  }

  // 檢查任務依賴是否完成
  const executionCheck = await canExecuteTask(taskId);
  if (!executionCheck.canExecute) {
    const blockingTaskIds = executionCheck.blockedBy || [];
    const blockingTasks = await Promise.all(
      blockingTaskIds.map((id) => getTaskById(id))
    );
    const blockingTaskInfo = blockingTasks
      .filter((t) => t !== null)
      .map((t) => `- ${t!.name} (ID: ${t!.id})`)
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統通知\n\n任務 '${task.name}' (ID: ${taskId}) 無法執行，因為以下依賴任務尚未完成：\n${blockingTaskInfo}\n\n請先完成依賴任務，或使用 'split_tasks' 工具調整任務依賴關係。`,
        },
      ],
    };
  }

  // *** 開始任務嘗試 ***
  const startedTask = await startTaskAttempt(taskId);
  if (!startedTask) {
      // Handle error if starting attempt fails (e.g., task disappeared)
      return {
          content: [
              {
                  type: "text" as const,
                  text: `## 系統錯誤\n\n嘗試開始執行任務 '${taskId}' 時出錯，任務可能已被刪除。`,
              },
          ],
      };
  }

  // 評估任務複雜度
  const complexity = await assessTaskComplexity(taskId);

  // 載入相關文件內容
  const loadedFilesResult = await loadTaskRelatedFiles(task.relatedFiles || []);
  const relatedFilesSummary = typeof loadedFilesResult === 'string' ? loadedFilesResult : loadedFilesResult.summary;

  // Generate prompt (async)
  const prompt = await getExecuteTaskPrompt({
    task: startedTask,
    complexityAssessment: complexity || undefined,
    relatedFilesSummary,
  });

  // 返回生成的prompt給AI Agent
  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
    ephemeral: {
      // 可選的後設資料，例如任務複雜度評級
      taskComplexity: complexity?.level || TaskComplexityLevel.LOW,
    },
  };
}

// 檢驗任務工具
export const verifyTaskSchema = z.object({
  taskId: z
    .string()
    .uuid({ message: "任務ID格式無效，請提供有效的UUID格式" })
    .describe("待驗證任務的唯一標識符，必須是系統中存在的有效任務ID"),
});

export async function verifyTask({ taskId }: z.infer<typeof verifyTaskSchema>) {
  const task = await getTaskById(taskId);

  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統錯誤\n\n找不到ID為 \`${taskId}\` 的任務。請使用「list_tasks」工具確認有效的任務ID後再試。`,
        },
      ],
      isError: true,
    };
  }

  if (task.status !== TaskStatus.IN_PROGRESS) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 狀態錯誤\n\n任務 "${task.name}" (ID: \`${task.id}\`) 當前狀態為 "${task.status}"，不處於進行中狀態，無法進行檢驗。\n\n只有狀態為「進行中」的任務才能進行檢驗。請先使用「execute_task」工具開始任務執行。`,
        },
      ],
      isError: true,
    };
  }

  // 使用prompt生成器獲取最終prompt
  const prompt = getVerifyTaskPrompt({ task });

  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
  };
}

// 新增：報告任務結果工具
export const reportTaskResultSchema = z.object({
  taskId: z.string().uuid({ message: "請提供有效的任務ID (UUID格式)" }),
  status: z.enum(["succeeded", "failed"], {
    errorMap: () => ({ message: "狀態必須是 'succeeded' 或 'failed'" }),
  }),
  error: z.string().optional().describe("如果狀態是 'failed'，請提供失敗的原因或錯誤信息"),
});

export async function reportTaskResult({
  taskId,
  status,
  error,
}: z.infer<typeof reportTaskResultSchema>) {
  if (status === "failed" && !error) {
    return {
      content: [
        {
          type: "text" as const,
          text: "## 參數錯誤\n\n當狀態為 'failed' 時，必須提供 'error' 參數說明失敗原因。",
        },
      ],
    };
  }

  const updatedTask = await recordTaskAttemptResult(taskId, status, error);

  if (!updatedTask) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統錯誤\n\n記錄任務 '${taskId}' 結果時出錯，可能是任務ID無效或任務尚未開始執行。`,
        },
      ],
    };
  }

  // 處理失敗情況
  if (status === "failed") {
    const loopDetection = detectTaskLoop(updatedTask, 2);

    if (loopDetection.isLooping) {
      // Load the mandatory consult prompt template
      const consultPromptTemplate = loadPromptFromTemplate("toolResponses/consultExpert.md");
      // Format the failure history for the prompt
      const formattedFailureHistory = loopDetection.failureHistory.map((e, i) => `${i + 1}. ${e}`).join("\n");
      // Generate the final prompt
      const consultPrompt = generatePrompt(consultPromptTemplate, {
        taskName: updatedTask.name,
        taskId: taskId,
        failureCount: loopDetection.failureHistory.length,
        formattedFailureHistory: formattedFailureHistory
      });

      return {
        content: [
          {
            type: "text" as const,
            text: consultPrompt,
          },
        ],
      };
    } else {
      // TODO: Replace with real prompt generator call
      const retryPrompt = `## 任務失敗\n\n執行任務 '${updatedTask.name}' (ID: ${taskId}) 失敗。錯誤：${error}\n\n請分析失敗原因。你可以：\n1. 嘗試修正問題後，再次呼叫 'execute_task' 重試此任務。\n2. 如果問題無法解決或需要調整計劃，請使用 'plan_task' 或 'split_tasks' 修改任務。`;
      return {
        content: [
          {
            type: "text" as const,
            text: retryPrompt,
          },
        ],
      };
    }
  }

  // 處理成功情況
  if (status === "succeeded") {
    // Load the success prompt template (Assuming one exists or using a simple string)
    // TODO: Create and use a dedicated template for this success message if needed
    const completePromptTemplate = loadPromptFromTemplate("toolResponses/reportSuccess.md"); // Assuming this template exists
    const completePrompt = generatePrompt(completePromptTemplate, {
        taskName: updatedTask.name,
        taskId: taskId
    });
    return {
      content: [
        {
          type: "text" as const,
          text: completePrompt,
        },
      ],
    };
  }

  // Default fallback (should not be reached)
  return {
    content: [
        {
            type: "text" as const,
            text: "內部錯誤：無法處理的任務結果狀態。",
        },
    ],
  };
}

// 完成任務工具
export const completeTaskSchema = z.object({
  taskId: z
    .string()
    .uuid({ message: "請提供有效的任務ID (UUID格式)" })
    .describe("待標記為完成的任務唯一標識符，必須是狀態為「進行中」的有效任務ID"),
  summary: z
    .string()
    .optional()
    .describe("任務完成摘要，簡潔描述實施結果和重要決策（選填，如未提供將自動生成）"),
});

export async function completeTask({
  taskId,
  summary,
}: z.infer<typeof completeTaskSchema>) {
  const task = await getTaskById(taskId);

  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統錯誤\n\n找不到ID為 '${taskId}' 的任務。`,
        },
      ],
    };
  }

  // ** Check if the task was already marked COMPLETED by report_task_result **
  if (task.status !== TaskStatus.COMPLETED) {
       console.warn(`Warning: complete_task called for task ${taskId} which has status ${task.status}, expected COMPLETED.`);
  }

  // 如果未提供摘要，嘗試自動生成
  let finalSummary = summary;
  if (!finalSummary) {
    // 嘗試從任務描述或其他字段生成
    finalSummary = await generateTaskSummary(task.name, task.description);
  }

  // 更新任務摘要
  const updatedTask = await updateTaskSummary(taskId, finalSummary || "任務已完成");

  if (!updatedTask) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統錯誤\n\n更新任務 '${taskId}' 的摘要時發生錯誤。`,
        },
      ],
    };
  }

  // 使用prompt生成器獲取最終prompt
  const prompt = getCompleteTaskPrompt({
    task: updatedTask,
    completionTime: new Date().toISOString(), // Convert Date to string
  });

  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
  };
}

// 刪除任務工具
export const deleteTaskSchema = z.object({
  taskId: z
    .string()
    .uuid({ message: "任務ID格式無效，請提供有效的UUID格式" })
    .describe("待刪除任務的唯一標識符，必須是系統中存在且未完成的任務ID"),
});

export async function deleteTask({ taskId }: z.infer<typeof deleteTaskSchema>) {
  const task = await getTaskById(taskId);

  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: getDeleteTaskPrompt({ taskId }),
        },
      ],
      isError: true,
    };
  }

  if (task.status === TaskStatus.COMPLETED) {
    return {
      content: [
        {
          type: "text" as const,
          text: getDeleteTaskPrompt({ taskId, task, isTaskCompleted: true }),
        },
      ],
      isError: true,
    };
  }

  const result = await modelDeleteTask(taskId);

  return {
    content: [
      {
        type: "text" as const,
        text: getDeleteTaskPrompt({
          taskId,
          task,
          success: result.success,
          message: result.message,
        }),
      },
    ],
    isError: !result.success,
  };
}

// 清除所有任務工具
export const clearAllTasksSchema = z.object({
  confirm: z
    .boolean()
    .refine((val) => val === true, {
      message:
        "必須明確確認清除操作，請將 confirm 參數設置為 true 以確認此危險操作",
    })
    .describe("確認刪除所有未完成的任務（此操作不可逆）"),
});

export async function clearAllTasks({
  confirm,
}: z.infer<typeof clearAllTasksSchema>) {
  // 安全檢查：如果沒有確認，則拒絕操作
  if (!confirm) {
    return {
      content: [
        {
          type: "text" as const,
          text: getClearAllTasksPrompt({ confirm: false }),
        },
      ],
    };
  }

  // 檢查是否真的有任務需要清除
  const allTasks = await getAllTasks();
  if (allTasks.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: getClearAllTasksPrompt({ isEmpty: true }),
        },
      ],
    };
  }

  // 執行清除操作
  const result = await modelClearAllTasks();

  return {
    content: [
      {
        type: "text" as const,
        text: getClearAllTasksPrompt({
          success: result.success,
          message: result.message,
          backupFile: result.backupFile,
        }),
      },
    ],
    isError: !result.success,
  };
}

// 更新任務內容工具
export const updateTaskContentSchema = z.object({
  taskId: z
    .string()
    .uuid({ message: "任務ID格式無效，請提供有效的UUID格式" })
    .describe("待更新任務的唯一標識符，必須是系統中存在且未完成的任務ID"),
  name: z.string().optional().describe("任務的新名稱（選填）"),
  description: z.string().optional().describe("任務的新描述內容（選填）"),
  notes: z.string().optional().describe("任務的新補充說明（選填）"),
  dependencies: z
    .array(z.string())
    .optional()
    .describe("任務的新依賴關係（選填）"),
  relatedFiles: z
    .array(
      z.object({
        path: z
          .string()
          .min(1, { message: "文件路徑不能為空，請提供有效的文件路徑" })
          .describe("文件路徑，可以是相對於項目根目錄的路徑或絕對路徑"),
        type: z
          .nativeEnum(RelatedFileType)
          .describe(
            "文件與任務的關係類型 (TO_MODIFY, REFERENCE, CREATE, DEPENDENCY, OTHER)"
          ),
        description: z.string().optional().describe("文件的補充描述（選填）"),
        lineStart: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("相關代碼區塊的起始行（選填）"),
        lineEnd: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("相關代碼區塊的結束行（選填）"),
      })
    )
    .optional()
    .describe(
      "與任務相關的文件列表，用於記錄與任務相關的代碼文件、參考資料、要建立的檔案等（選填）"
    ),
  implementationGuide: z
    .string()
    .optional()
    .describe("任務的新實現指南（選填）"),
  verificationCriteria: z
    .string()
    .optional()
    .describe("任務的新驗證標準（選填）"),
});

export async function updateTaskContent({
  taskId,
  name,
  description,
  notes,
  relatedFiles,
  dependencies,
  implementationGuide,
  verificationCriteria,
}: z.infer<typeof updateTaskContentSchema>) {
  if (relatedFiles) {
    for (const file of relatedFiles) {
      if (
        (file.lineStart && !file.lineEnd) ||
        (!file.lineStart && file.lineEnd) ||
        (file.lineStart && file.lineEnd && file.lineStart > file.lineEnd)
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: getUpdateTaskContentPrompt({
                taskId,
                validationError:
                  "行號設置無效：必須同時設置起始行和結束行，且起始行必須小於結束行",
              }),
            },
          ],
        };
      }
    }
  }

  if (
    !(
      name ||
      description ||
      notes ||
      dependencies ||
      implementationGuide ||
      verificationCriteria ||
      relatedFiles
    )
  ) {
    return {
      content: [
        {
          type: "text" as const,
          text: getUpdateTaskContentPrompt({
            taskId,
            emptyUpdate: true,
          }),
        },
      ],
    };
  }

  // 獲取任務以檢查它是否存在
  const task = await getTaskById(taskId);

  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: getUpdateTaskContentPrompt({
            taskId,
          }),
        },
      ],
      isError: true,
    };
  }

  // 記錄要更新的任務和內容
  const prompt = getUpdateTaskContentPrompt({
    taskId,
    task,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
    isError: false,
  };
}

// 查詢任務工具
export const queryTaskSchema = z.object({
  query: z
    .string()
    .min(1, {
      message: "查詢內容不能為空，請提供任務ID或搜尋關鍵字",
    })
    .describe("搜尋查詢文字，可以是任務ID或多個關鍵字（空格分隔）"),
  isId: z
    .boolean()
    .optional()
    .default(false)
    .describe("指定是否為ID查詢模式，默認為否（關鍵字模式）"),
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe("分頁頁碼，默認為第1頁"),
  pageSize: z
    .number()
    .int()
    .positive()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe("每頁顯示的任務數量，默認為5筆，最大20筆"),
});

export async function queryTask({
  query,
  isId = false,
  page = 1,
  pageSize = 3,
}: z.infer<typeof queryTaskSchema>) {
  try {
    // 使用系統指令搜尋函數
    const results = await searchTasksWithCommand(query, isId, page, pageSize);

    // 使用prompt生成器獲取最終prompt
    const prompt = getQueryTaskPrompt({
      query,
      isId,
      tasks: results.tasks,
      totalTasks: results.pagination.totalResults,
      page: results.pagination.currentPage,
      pageSize,
      totalPages: results.pagination.totalPages,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: prompt,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統錯誤\n\n查詢任務時發生錯誤: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
}

// 取得完整任務詳情的參數
export const getTaskDetailSchema = z.object({
  taskId: z
    .string()
    .min(1, {
      message: "任務ID不能為空，請提供有效的任務ID",
    })
    .describe("欲檢視詳情的任務ID"),
});

// 取得任務完整詳情
export async function getTaskDetail({
  taskId,
}: z.infer<typeof getTaskDetailSchema>) {
  try {
    // 使用 searchTasksWithCommand 替代 getTaskById，實現記憶區任務搜索
    // 設置 isId 為 true，表示按 ID 搜索；頁碼為 1，每頁大小為 1
    const result = await searchTasksWithCommand(taskId, true, 1, 1);

    // 檢查是否找到任務
    if (result.tasks.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `## 錯誤\n\n找不到ID為 \`${taskId}\` 的任務。請確認任務ID是否正確。`,
          },
        ],
        isError: true,
      };
    }

    // 獲取找到的任務（第一個也是唯一的一個）
    const task = result.tasks[0];

    // 使用prompt生成器獲取最終prompt
    const prompt = getGetTaskDetailPrompt({
      taskId,
      task,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: prompt,
        },
      ],
    };
  } catch (error) {
    // 使用prompt生成器獲取錯誤訊息
    const errorPrompt = getGetTaskDetailPrompt({
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: errorPrompt,
        },
      ],
    };
  }
}

// 新增：檢查 Agent 狀態工具
export const checkAgentStatusSchema = z.object({}).describe("檢查當前進行中任務的狀態，以診斷可能的停滯情況。不需要參數。");

export async function checkAgentStatus(): Promise<{ content: { type: "text"; text: string }[] }> {
    try {
        const allTasks = await getAllTasks();
        const inProgressTasks = allTasks.filter(task => task.status === TaskStatus.IN_PROGRESS);

        const statusSummaryLines: string[] = [];

        if (inProgressTasks.length === 0) {
            statusSummaryLines.push("目前沒有任何任務處於 IN_PROGRESS 狀態。");
            statusSummaryLines.push("建議使用 `list_tasks` 查看待處理任務，或使用 `plan_task` 開始新計劃。");
        } else {
            statusSummaryLines.push("以下是目前 IN_PROGRESS 任務的狀態：");
            statusSummaryLines.push(""); // Add a blank line

            for (const task of inProgressTasks) {
                const now = new Date();
                const updatedAt = task.updatedAt;
                const timeSinceUpdate = now.getTime() - updatedAt.getTime();
                const minutesSinceUpdate = Math.round(timeSinceUpdate / (1000 * 60));

                statusSummaryLines.push(`--- Task: ${task.name} (ID: ${task.id}) ---`);
                statusSummaryLines.push(`- 最後更新時間: ${updatedAt.toISOString()} (${minutesSinceUpdate} 分鐘前)`);

                let lastAction = "無記錄的操作";
                let lastActionTime = updatedAt;

                if (task.attemptHistory && task.attemptHistory.length > 0) {
                    const lastAttempt = task.attemptHistory[task.attemptHistory.length - 1];
                    lastActionTime = lastAttempt.timestamp;
                    if (lastAttempt.status === "started") {
                         lastAction = `執行開始於 ${lastAttempt.timestamp.toISOString()}`;
                    } else {
                        lastAction = `上次嘗試 ${lastAttempt.status} 於 ${lastAttempt.timestamp.toISOString()}` + (lastAttempt.error ? ` (錯誤: ${lastAttempt.error.substring(0, 100)}...)` : '');
                    }
                }

                 if (task.expertSuggestions && task.expertSuggestions.length > 0) {
                    const lastSuggestion = task.expertSuggestions[task.expertSuggestions.length - 1];
                    if(lastSuggestion.timestamp > lastActionTime) {
                        lastActionTime = lastSuggestion.timestamp;
                        lastAction = `收到專家建議於 ${lastSuggestion.timestamp.toISOString()}`;
                    }
                }

                const timeSinceLastAction = now.getTime() - lastActionTime.getTime();
                const minutesSinceLastAction = Math.round(timeSinceLastAction / (1000 * 60));

                statusSummaryLines.push(`- 最後記錄的操作: ${lastAction} (${minutesSinceLastAction} 分鐘前)`);

                if (minutesSinceLastAction > 5) {
                    statusSummaryLines.push(`- **注意:** 自上次記錄的操作以來已過去 ${minutesSinceLastAction} 分鐘。`);
                    statusSummaryLines.push(`  - 如果任務卡住或失敗，請使用 report_task_result(taskId='${task.id}', status='failed', error='...') 報告錯誤。`);
                    statusSummaryLines.push(`  - 如果任務已成功完成，請使用 report_task_result(taskId='${task.id}', status='succeeded') 報告成功。`);
                    statusSummaryLines.push(`  - 如果需要幫助，請使用 consult_expert(taskId='${task.id}', ...)。`);
                } else {
                    statusSummaryLines.push(`- 狀態似乎正常，上次活動在 ${minutesSinceLastAction} 分鐘前。`);
                }
                statusSummaryLines.push(""); // Add blank line after each task
            }
            statusSummaryLines.push("---請根據以上狀態判斷後續操作。");
        }

        const statusSummary = statusSummaryLines.join('\n'); // Join lines with newline

        // Construct final prompt using template literal for clarity
        const prompt = `## Agent 狀態檢查\n\n${statusSummary}`;

        return {
            content: [
                {
                    type: "text" as const,
                    text: prompt,
                },
            ],
        };

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Ensure return type matches Promise<{ content: ... }>
        return {
            content: [
                {
                    type: "text" as const,
                    text: `檢查 Agent 狀態時發生錯誤: ${errorMsg}`,
                },
            ],
        };
    }
}
