// 任務狀態枚舉：定義任務在工作流程中的當前階段
export enum TaskStatus {
  PENDING = "待處理", // 已創建但尚未開始執行的任務
  IN_PROGRESS = "進行中", // 當前正在執行的任務
  COMPLETED = "已完成", // 已成功完成並通過驗證的任務
  BLOCKED = "被阻擋", // 由於依賴關係而暫時無法執行的任務
}

// 任務依賴關係：定義任務之間的前置條件關係
export interface TaskDependency {
  taskId: string; // 前置任務的唯一標識符，當前任務執行前必須完成此依賴任務
}

// 相關文件類型：定義文件與任務的關係類型
export enum RelatedFileType {
  TO_MODIFY = "TO_MODIFY", // 需要在任務中修改的文件
  REFERENCE = "REFERENCE", // 任務的參考資料或相關文檔
  CREATE = "CREATE", // 需要在任務中建立的文件
  DEPENDENCY = "DEPENDENCY", // 任務依賴的組件或庫文件
  OTHER = "OTHER", // 其他類型的相關文件
}

// 相關文件：定義任務相關的文件信息
export interface RelatedFile {
  path: string; // 文件路徑，可以是相對於項目根目錄的路徑或絕對路徑
  type: RelatedFileType; // 文件與任務的關係類型
  description?: string; // 文件的補充描述，說明其與任務的具體關係或用途
  lineStart?: number; // 相關代碼區塊的起始行（選填）
  lineEnd?: number; // 相關代碼區塊的結束行（選填）
}

// 新增介面：記錄任務嘗試
export interface TaskAttempt {
  timestamp: Date; // 嘗試的時間戳
  status: "started" | "failed" | "succeeded"; // 嘗試的狀態
  error?: string; // 如果失敗，記錄錯誤訊息
}

// 任務介面：定義任務的完整數據結構
export interface Task {
  id: string; // 任務的唯一標識符
  name: string; // 簡潔明確的任務名稱
  description: string; // 詳細的任務描述，包含實施要點和驗收標準
  notes?: string; // 補充說明、特殊處理要求或實施建議（選填）
  status: TaskStatus; // 任務當前的執行狀態
  dependencies: TaskDependency[]; // 任務的前置依賴關係列表
  createdAt: Date; // 任務創建的時間戳
  updatedAt: Date; // 任務最後更新的時間戳
  completedAt?: Date; // 任務完成的時間戳（僅適用於已完成的任務）
  summary?: string; // 任務完成摘要，簡潔描述實施結果和重要決策（僅適用於已完成的任務）
  relatedFiles?: RelatedFile[]; // 與任務相關的文件列表（選填）

  // 新增欄位：保存完整的技術分析結果
  analysisResult?: string; // 來自 analyze_task 和 reflect_task 階段的完整分析結果

  // 新增欄位：保存具體的實現指南
  implementationGuide?: string; // 具體的實現方法、步驟和建議

  // 新增欄位：保存驗證標準和檢驗方法
  verificationCriteria?: string; // 明確的驗證標準、測試要點和驗收條件

  // 新增欄位：記錄任務嘗試歷史
  attemptHistory?: TaskAttempt[]; // 記錄執行嘗試的列表 (選填)
}

// 規劃任務的參數：用於初始化任務規劃階段
export interface PlanTaskArgs {
  description: string; // 完整詳細的任務問題描述，應包含任務目標、背景及預期成果
  requirements?: string; // 任務的特定技術要求、業務約束條件或品質標準（選填）
}

// 分析問題的參數：用於深入分析任務並提出技術方案
export interface AnalyzeTaskArgs {
  summary: string; // 結構化的任務摘要，包含任務目標、範圍與關鍵技術挑戰
  initialConcept: string; // 初步解答構想，包含技術方案、架構設計和實施策略
  previousAnalysis?: string; // 前次迭代的分析結果，用於持續改進方案（僅在重新分析時需提供）
}

// 反思構想的參數：用於對分析結果進行批判性評估
export interface ReflectTaskArgs {
  summary: string; // 結構化的任務摘要，保持與分析階段一致以確保連續性
  analysis: string; // 完整詳盡的技術分析結果，包括所有技術細節、依賴組件和實施方案
}

// 拆分任務的參數：用於將大型任務分解為可管理的小型任務
export interface SplitTasksArgs {
  /**
   * 任務更新模式（必填）：
   * - "append"：保留所有現有任務，新增提供的任務
   * - "overwrite"：保留已完成的任務，但刪除所有未完成的任務，然後新增提供的任務
   * - "selective"：保留所有未提供名稱的現有任務，更新名稱匹配的任務
   * - "clearAllTasks"：清除所有任務並創建備份
   */
  updateMode: "append" | "overwrite" | "selective" | "clearAllTasks";

  // 全局分析結果：用於所有任務的共享分析數據
  globalAnalysisResult?: string; // 來自 reflect_task 的完整分析結果，適用於所有任務的通用部分

  tasks: Array<{
    name: string; // 簡潔明確的任務名稱，應能清晰表達任務目的
    description: string; // 詳細的任務描述，包含實施要點、技術細節和驗收標準
    notes?: string; // 補充說明、特殊處理要求或實施建議（選填）
    dependencies?: string[]; // 此任務依賴的前置任務ID列表，形成任務的有向無環依賴圖
    relatedFiles?: RelatedFile[]; // 與任務相關的文件列表（選填）

    // 新增欄位：任務專屬的實現指南
    implementationGuide?: string; // 此特定任務的具體實現方法和步驟

    // 新增欄位：任務專屬的驗證標準
    verificationCriteria?: string; // 此特定任務的驗證標準和檢驗方法
  }>;
}

// 列出任務的參數（無）

// 執行任務的參數：用於開始執行特定任務
export interface ExecuteTaskArgs {
  taskId: string; // 待執行任務的唯一標識符，必須是系統中存在的有效任務ID
}

// 檢驗任務的參數：用於評估任務的完成質量
export interface VerifyTaskArgs {
  taskId: string; // 待驗證任務的唯一標識符，必須是狀態為「進行中」的有效任務ID
}

// 完成任務的參數：用於標記任務為已完成狀態
export interface CompleteTaskArgs {
  taskId: string; // 待標記為完成的任務唯一標識符，必須是狀態為「進行中」的有效任務ID
  summary?: string; // 任務完成摘要，簡潔描述實施結果和重要決策（選填，如未提供將自動生成）
}

// 任務複雜度級別：定義任務的複雜程度分類
export enum TaskComplexityLevel {
  LOW = "低複雜度", // 簡單且直接的任務，通常不需要特殊處理
  MEDIUM = "中等複雜度", // 具有一定複雜性但仍可管理的任務
  HIGH = "高複雜度", // 複雜且耗時的任務，需要特別關注
  VERY_HIGH = "極高複雜度", // 極其複雜的任務，建議拆分處理
}

// 任務複雜度閾值：定義任務複雜度評估的參考標準
export const TaskComplexityThresholds = {
  DESCRIPTION_LENGTH: {
    MEDIUM: 500, // 超過此字數判定為中等複雜度
    HIGH: 1000, // 超過此字數判定為高複雜度
    VERY_HIGH: 2000, // 超過此字數判定為極高複雜度
  },
  DEPENDENCIES_COUNT: {
    MEDIUM: 2, // 超過此依賴數量判定為中等複雜度
    HIGH: 5, // 超過此依賴數量判定為高複雜度
    VERY_HIGH: 10, // 超過此依賴數量判定為極高複雜度
  },
  NOTES_LENGTH: {
    MEDIUM: 200, // 超過此字數判定為中等複雜度
    HIGH: 500, // 超過此字數判定為高複雜度
    VERY_HIGH: 1000, // 超過此字數判定為極高複雜度
  },
};

// 任務複雜度評估結果：記錄任務複雜度分析的詳細結果
export interface TaskComplexityAssessment {
  level: TaskComplexityLevel; // 整體複雜度級別
  metrics: {
    // 各項評估指標的詳細數據
    descriptionLength: number; // 描述長度
    dependenciesCount: number; // 依賴數量
    notesLength: number; // 注記長度
    hasNotes: boolean; // 是否有注記
  };
  recommendations: string[]; // 處理建議列表
}

// 思維鏈資料結構
export * from "./thoughtChain.js";
