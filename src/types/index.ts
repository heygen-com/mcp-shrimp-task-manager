// 任務狀態枚舉：定義任務在工作流程中的當前階段
export enum TaskStatus {
  PENDING = "pending", // 已創建但尚未開始執行的任務
  IN_PROGRESS = "in_progress", // 當前正在執行的任務
  COMPLETED = "completed", // 已成功完成並通過驗證的任務
  BLOCKED = "blocked", // 由於依賴關係而暫時無法執行的任務
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

// Task attempt interface: tracks execution attempts
export interface TaskAttempt {
  attemptNumber: number;
  timestamp: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: "started" | "completed" | "failed" | "succeeded";
  error?: string;
  output?: string;
}

// Expert suggestion interface: stores AI expert consultations
export interface ExpertSuggestion {
  id?: string;
  timestamp: Date;
  expertType?: string;
  suggestion?: string;
  context?: string;
  advice?: string;
  problemDescription?: string;
  relevantContext?: string;
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

  projectId?: string; // Optional project ID reference
  
  // Task execution tracking
  attemptHistory?: TaskAttempt[]; // History of execution attempts
  expertSuggestions?: ExpertSuggestion[]; // AI expert consultations
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

// Project status enum: defines the current state of a project
export enum ProjectStatus {
  ACTIVE = "active", // Currently active project
  ARCHIVED = "archived", // Archived project (read-only)
  PAUSED = "paused", // Temporarily paused project
  COMPLETED = "completed", // Completed project
}

// External tracker types
export enum TrackerType {
  JIRA = "jira",
  GITHUB = "github",
  GITLAB = "gitlab",
  LINEAR = "linear",
  ASANA = "asana",
  TRELLO = "trello",
  NOTION = "notion",
  OTHER = "other",
}

// --- BEGIN NEW JIRA SYNC METADATA ---_/
// Stores JIRA epic sync state
export interface JiraSyncMetadata {
  lastSyncTimestamp: string; // ISO string of the last successful sync
  lastSyncETag?: string; // Optional: ETag from the last JIRA API response for conditional GETs
  processedChangelogEntryIds: string[]; // IDs of changelog entries processed in the last sync
}
// --- END NEW JIRA SYNC METADATA ---_/

// JIRA issue types
export enum JiraIssueType {
  EPIC = "epic",
  STORY = "story",
  TASK = "task",
  BUG = "bug",
  SUBTASK = "subtask",
}

// Project priority levels
export enum ProjectPriority {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

// Project category/type
export enum ProjectCategory {
  FEATURE = "feature",
  BUGFIX = "bugfix",
  REFACTOR = "refactor",
  RESEARCH = "research",
  INFRASTRUCTURE = "infrastructure",
  DOCUMENTATION = "documentation",
  PROTOTYPE = "prototype",
  MIGRATION = "migration",
}

// External tracker info
export interface ExternalTracker {
  type: TrackerType; // Type of external tracker
  issueKey?: string; // Issue key (e.g., PROJ-123 for JIRA)
  issueType?: JiraIssueType | string; // Type of issue (epic, story, etc.)
  url?: string; // Direct URL to the issue
  parentKey?: string; // Parent issue key (for subtasks)
  metadata?: Record<string, unknown>; // Additional tracker-specific data
  syncMetadata?: JiraSyncMetadata; // <--- ADDED FOR JIRA SYNC STATE
}

// Project metadata
export interface ProjectMetadata {
  // People & teams
  owner?: string; // Project owner/lead
  assignees?: string[]; // Team members assigned
  team?: string; // Team name
  stakeholders?: string[]; // List of stakeholders
  
  // Time & planning
  deadline?: Date; // Project deadline
  startDate?: Date; // Project start date
  estimatedHours?: number; // Estimated hours
  actualHours?: number; // Actual hours spent
  
  // Technical details
  repository?: string; // Git repository URL
  branch?: string; // Main development branch
  environment?: string; // Target environment (dev, staging, prod)
  version?: string; // Project version
  
  // Documentation & resources
  documentationUrls?: string[]; // Links to docs, wikis
  designUrls?: string[]; // Links to designs, mockups
  meetingNotes?: string[]; // Links to meeting notes
  
  // Business context
  budget?: number; // Project budget
  businessValue?: string; // Business value description
  kpis?: string[]; // Key performance indicators
  
  // Risk & dependencies
  risks?: string[]; // Identified risks
  externalDependencies?: string[]; // External dependencies
  blockers?: string[]; // Current blockers
}

// Project milestone
export interface ProjectMilestone {
  id: string;
  name: string;
  description?: string;
  dueDate?: Date;
  completed: boolean;
  completedAt?: Date;
}

// Project interface: defines the complete data structure for a project
export interface Project {
  id: string; // Unique project identifier
  name: string; // Project name
  description: string; // Detailed project description
  status: ProjectStatus; // Current project status
  goals: string[]; // Project goals and objectives
  tags: string[]; // Tags for categorization and search
  createdAt: Date; // Project creation timestamp
  updatedAt: Date; // Last update timestamp
  taskIds: string[]; // IDs of tasks associated with this project
  contextIds: string[]; // IDs of context entries
  insightIds: string[]; // IDs of insights
  projectId?: string; // Optional parent project ID for sub-projects
  
  // New fields for external tracking and metadata
  priority?: ProjectPriority; // Project priority
  category?: ProjectCategory; // Project type/category
  externalTracker?: ExternalTracker; // External tracker integration
  metadata?: ProjectMetadata; // Additional project metadata
  milestones?: ProjectMilestone[]; // Project milestones
  files?: string[]; // Absolute paths to files that should be included in project context
}

// Project context types
export enum ProjectContextType {
  LEARNING = "learning", // Learning or discovery
  DECISION = "decision", // Important decision made
  PROBLEM = "problem", // Problem encountered
  SOLUTION = "solution", // Solution found
  REFERENCE = "reference", // Reference information
  NOTE = "note", // General note
  BREAKTHROUGH = "breakthrough", // Major breakthrough or ah-ha moment
}

// Project context: stores contextual information and learnings
export interface ProjectContext {
  id: string; // Unique context identifier
  type: ProjectContextType; // Type of context
  content: string; // Context content
  tags?: string[]; // Tags for categorization
  relatedTaskIds?: string[]; // Related task IDs
  metadata?: Record<string, unknown>; // Additional metadata
  createdAt: Date; // Creation timestamp
}

// Project insight: represents ah-ha moments and breakthroughs
export interface ProjectInsight {
  id: string; // Unique insight identifier
  title: string; // Insight title
  description: string; // Detailed description
  impact: "low" | "medium" | "high" | "critical"; // Impact level
  tags?: string[]; // Tags for categorization
  relatedContextIds?: string[]; // Related context IDs
  relatedTaskIds?: string[]; // Related task IDs
  actionItems?: string[]; // Suggested action items
  createdAt: Date; // Creation timestamp
}

// Project report: generated reports about project progress
export interface ProjectReport {
  id: string; // Report identifier
  projectId: string; // Associated project ID
  type: "summary" | "progress" | "insights" | "full"; // Report type
  generatedAt: Date; // Generation timestamp
  summary: {
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    inProgressTasks: number;
    completionRate: number;
    totalContexts: number;
    totalInsights: number;
  };
  content: Record<string, unknown>; // Report content varies by type
}
