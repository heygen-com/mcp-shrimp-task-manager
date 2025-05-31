export enum MemoryType {
  BREAKTHROUGH = 'breakthrough',
  DECISION = 'decision',
  FEEDBACK = 'feedback',
  ERROR_RECOVERY = 'error_recovery',
  PATTERN = 'pattern',
  USER_PREFERENCE = 'user_preference'
}

export interface MemoryContextSnapshot {
  files?: string[];
  recentActions?: string[];
  environmentState?: Record<string, unknown>;
  taskContext?: {
    taskId?: string;
    taskName?: string;
    taskStatus?: string;
  };
}

export interface Memory {
  // Core fields
  id: string;
  version: number;
  content: string;
  summary: string;
  
  // Temporal & lifecycle
  created: Date;
  lastAccessed: Date;
  lastUpdated?: Date;
  accessCount: number;
  relevanceScore: number; // 0-1, decays over time
  consolidatedFrom?: string[]; // IDs of memories merged into this
  supersedes?: string; // Previous version ID
  archived?: boolean;
  
  // Classification
  type: MemoryType;
  confidence: number; // 0-1, how sure we are this is valuable
  triggerContext?: string; // What triggered creation
  
  // Associations
  projectId?: string;
  taskId?: string;
  relatedMemories: string[]; // Memory chain links
  tags: string[];
  entities?: string[]; // Extracted entities (files, functions, concepts)
  
  // Context preservation
  contextSnapshot: MemoryContextSnapshot;
  
  // Metadata
  author: string;
  metadata: Record<string, unknown>;
}

export interface MemoryQuery {
  filters?: {
    projectId?: string;
    types?: MemoryType[];
    tags?: string[];
    dateRange?: { start: Date; end: Date };
    minRelevance?: number;
    archived?: boolean;
  };
  searchText?: string;
  context?: {
    currentTask?: string;
    currentFiles?: string[];
    recentActions?: string[];
  };
  limit?: number;
  includeChains?: boolean;
  sortBy?: 'relevance' | 'recency' | 'accessCount';
}

export interface MemoryIndex {
  projectIndex: Record<string, string[]>; // projectId -> memoryIds
  typeIndex: Record<MemoryType, string[]>; // type -> memoryIds
  tagIndex: Record<string, string[]>; // tag -> memoryIds
  entityIndex: Record<string, string[]>; // entity -> memoryIds
  temporalIndex: Array<{ id: string; timestamp: Date }>; // sorted by time
}

export interface MemoryStats {
  totalMemories: number;
  byType: Record<MemoryType, number>;
  byProject: Record<string, number>;
  averageRelevanceScore: number;
  lastUpdated: Date;
}

// For memory chains and relationships
export interface MemoryChain {
  rootMemoryId: string;
  chainMembers: string[];
  theme?: string;
  strength: number; // 0-1, how strongly related
}

// For deduplication
export interface MemorySimilarity {
  memory1Id: string;
  memory2Id: string;
  similarity: number; // 0-1
  suggestMerge: boolean;
} 