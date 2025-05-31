import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Memory, MemoryIndex, MemoryQuery, MemoryType, MemoryStats } from '../types/memory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, "data");
const MEMORY_DIR = path.join(DATA_DIR, "memories");
const INDEX_FILE = path.join(MEMORY_DIR, "_index.json");
const STATS_FILE = path.join(MEMORY_DIR, "_stats.json");

// Ensure memory directory exists
async function ensureMemoryDir(): Promise<void> {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating memory directory:', error);
  }
}

// Generate memory filename with timestamp
function generateMemoryFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `memory_${year}${month}${day}${hours}${minutes}${seconds}.json`;
}

// Load memory index
async function loadIndex(): Promise<MemoryIndex & { fileIndex?: Record<string, string> }> {
  try {
    const data = await fs.readFile(INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    
    // Convert temporal index timestamps back to Date objects
    if (parsed.temporalIndex) {
      parsed.temporalIndex = parsed.temporalIndex.map((item: { id: string; timestamp: string | Date }) => ({
        id: item.id,
        timestamp: new Date(item.timestamp)
      }));
    }
    
    return parsed;
  } catch {
    // Return empty index if file doesn't exist
    return {
      projectIndex: {},
      typeIndex: Object.values(MemoryType).reduce((acc, type) => {
        acc[type] = [];
        return acc;
      }, {} as Record<MemoryType, string[]>),
      tagIndex: {},
      entityIndex: {},
      temporalIndex: [],
      fileIndex: {} // Maps memory ID to filename
    };
  }
}

// Save memory index
async function saveIndex(index: MemoryIndex & { fileIndex?: Record<string, string> }): Promise<void> {
  await ensureMemoryDir();
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

// Update index when memory is added/updated
function updateIndex(index: MemoryIndex & { fileIndex?: Record<string, string> }, memory: Memory, filename: string): void {
  // Initialize fileIndex if it doesn't exist
  if (!index.fileIndex) {
    index.fileIndex = {};
  }
  
  // Remove old entries if updating
  removeFromIndex(index, memory.id);
  
  // Add file mapping
  index.fileIndex[memory.id] = filename;
  
  // Add to project index
  if (memory.projectId) {
    if (!index.projectIndex[memory.projectId]) {
      index.projectIndex[memory.projectId] = [];
    }
    index.projectIndex[memory.projectId].push(memory.id);
  }
  
  // Add to type index
  if (!index.typeIndex[memory.type]) {
    index.typeIndex[memory.type] = [];
  }
  index.typeIndex[memory.type].push(memory.id);
  
  // Add to tag index
  memory.tags.forEach(tag => {
    if (!index.tagIndex[tag]) {
      index.tagIndex[tag] = [];
    }
    index.tagIndex[tag].push(memory.id);
  });
  
  // Add to entity index
  memory.entities?.forEach(entity => {
    if (!index.entityIndex[entity]) {
      index.entityIndex[entity] = [];
    }
    index.entityIndex[entity].push(memory.id);
  });
  
  // Add to temporal index (keep sorted)
  index.temporalIndex.push({ id: memory.id, timestamp: memory.created });
  index.temporalIndex.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// Remove memory from index
function removeFromIndex(index: MemoryIndex & { fileIndex?: Record<string, string> }, memoryId: string): void {
  // Remove file mapping
  if (index.fileIndex) {
    delete index.fileIndex[memoryId];
  }
  
  // Remove from all indices
  Object.values(index.projectIndex).forEach(ids => {
    const idx = ids.indexOf(memoryId);
    if (idx > -1) ids.splice(idx, 1);
  });
  
  Object.values(index.typeIndex).forEach(ids => {
    const idx = ids.indexOf(memoryId);
    if (idx > -1) ids.splice(idx, 1);
  });
  
  Object.values(index.tagIndex).forEach(ids => {
    const idx = ids.indexOf(memoryId);
    if (idx > -1) ids.splice(idx, 1);
  });
  
  Object.values(index.entityIndex).forEach(ids => {
    const idx = ids.indexOf(memoryId);
    if (idx > -1) ids.splice(idx, 1);
  });
  
  index.temporalIndex = index.temporalIndex.filter(item => item.id !== memoryId);
}

// Load a single memory from file
async function loadMemoryFromFile(filePath: string): Promise<Memory | null> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const memory = JSON.parse(data);
    // Convert date strings back to Date objects
    return {
      ...memory,
      created: new Date(memory.created),
      lastAccessed: new Date(memory.lastAccessed),
      lastUpdated: memory.lastUpdated ? new Date(memory.lastUpdated) : undefined
    } as Memory;
  } catch {
    return null;
  }
}

// Save a single memory to file
async function saveMemoryToFile(memory: Memory, filename: string): Promise<void> {
  await ensureMemoryDir();
  const filePath = path.join(MEMORY_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(memory, null, 2));
}

// Generate unique memory ID
export function generateMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Create a new memory
export async function createMemory(memory: Omit<Memory, 'id' | 'version' | 'created' | 'lastAccessed' | 'accessCount' | 'relevanceScore'>): Promise<Memory> {
  const newMemory: Memory = {
    ...memory,
    id: generateMemoryId(),
    version: 1,
    created: new Date(),
    lastAccessed: new Date(),
    accessCount: 0,
    relevanceScore: 1.0, // Start with high relevance
    relatedMemories: memory.relatedMemories || [],
    tags: memory.tags || [],
    archived: false
  };
  
  // Generate filename
  const filename = generateMemoryFilename();
  
  // Save memory to its own file
  await saveMemoryToFile(newMemory, filename);
  
  // Update index
  const index = await loadIndex();
  updateIndex(index, newMemory, filename);
  await saveIndex(index);
  
  // Update stats
  await updateStats(index);
  
  return newMemory;
}

// Get memory by ID
export async function getMemory(memoryId: string): Promise<Memory | null> {
  const index = await loadIndex();
  
  // Get filename from index
  const filename = index.fileIndex?.[memoryId];
  if (!filename) {
    return null;
  }
  
  const filePath = path.join(MEMORY_DIR, filename);
  const memory = await loadMemoryFromFile(filePath);
  
  if (memory) {
    // Update access count and time
    memory.lastAccessed = new Date();
    memory.accessCount++;
    await saveMemoryToFile(memory, filename);
    return memory;
  }
  
  return null;
}

// Update an existing memory
export async function updateMemory(memoryId: string, updates: Partial<Memory>): Promise<Memory | null> {
  const index = await loadIndex();
  const filename = index.fileIndex?.[memoryId];
  if (!filename) {
    return null;
  }
  
  const memory = await getMemory(memoryId);
  if (!memory) return null;
  
  // Create new version
  const updatedMemory: Memory = {
    ...memory,
    ...updates,
    id: memory.id, // Keep same ID
    version: memory.version + 1,
    lastUpdated: new Date(),
    supersedes: memory.id // Link to previous version
  };
  
  // Save updated memory to the same file
  await saveMemoryToFile(updatedMemory, filename);
  
  // Update index if necessary (e.g., if tags or entities changed)
  updateIndex(index, updatedMemory, filename);
  await saveIndex(index);
  
  return updatedMemory;
}

// Delete a memory
export async function deleteMemory(memoryId: string): Promise<boolean> {
  const index = await loadIndex();
  const filename = index.fileIndex?.[memoryId];
  if (!filename) {
    return false;
  }
  
  const filePath = path.join(MEMORY_DIR, filename);
  
  try {
    // Delete the file
    await fs.unlink(filePath);
    
    // Update index
    removeFromIndex(index, memoryId);
    await saveIndex(index);
    
    // Update stats
    await updateStats(index);
    
    return true;
  } catch {
    return false;
  }
}

// Query memories
export async function queryMemories(query: MemoryQuery): Promise<Memory[]> {
  const index = await loadIndex();
  const memoryIds = new Set<string>();
  
  // Apply filters
  if (query.filters) {
    // Filter by project
    if (query.filters.projectId) {
      const projectMemories = index.projectIndex[query.filters.projectId] || [];
      projectMemories.forEach(id => memoryIds.add(id));
    }
    
    // Filter by types
    if (query.filters.types && query.filters.types.length > 0) {
      query.filters.types.forEach(type => {
        const typeMemories = index.typeIndex[type] || [];
        typeMemories.forEach(id => memoryIds.add(id));
      });
    }
    
    // Filter by tags
    if (query.filters.tags && query.filters.tags.length > 0) {
      query.filters.tags.forEach(tag => {
        const tagMemories = index.tagIndex[tag] || [];
        tagMemories.forEach(id => memoryIds.add(id));
      });
    }
  } else {
    // No filters, get all memory IDs from temporal index
    index.temporalIndex.forEach(item => memoryIds.add(item.id));
  }
  
  // Load all matching memories
  const memories: Memory[] = [];
  
  for (const memoryId of memoryIds) {
    const filename = index.fileIndex?.[memoryId];
    if (filename) {
      const memory = await loadMemoryFromFile(path.join(MEMORY_DIR, filename));
      if (memory) {
        memories.push(memory);
      }
    }
  }
  
  // Apply additional filters
  let filteredMemories = memories;
  
  if (query.filters) {
    // Filter by date range
    if (query.filters.dateRange) {
      const { start, end } = query.filters.dateRange;
      filteredMemories = filteredMemories.filter(m => 
        m.created >= start && m.created <= end
      );
    }
    
    // Filter by relevance
    if (query.filters.minRelevance !== undefined) {
      filteredMemories = filteredMemories.filter(m => 
        m.relevanceScore >= query.filters!.minRelevance!
      );
    }
    
    // Filter by archived status
    if (query.filters.archived !== undefined) {
      filteredMemories = filteredMemories.filter(m => 
        m.archived === query.filters!.archived
      );
    }
  }
  
  // Text search
  if (query.searchText) {
    const searchLower = query.searchText.toLowerCase();
    // Split search text into words for more flexible matching
    const searchWords = searchLower.split(/\s+/).filter(word => word.length > 0);
    
    filteredMemories = filteredMemories.filter(m => {
      const contentLower = m.content.toLowerCase();
      const summaryLower = m.summary.toLowerCase();
      const tagsLower = m.tags.map(tag => tag.toLowerCase());
      
      // Check if ANY search word matches
      return searchWords.some(word => 
        contentLower.includes(word) ||
        summaryLower.includes(word) ||
        tagsLower.some(tag => tag.includes(word))
      );
    });
  }
  
  // Context-aware scoring
  if (query.context) {
    filteredMemories = scoreMemoriesByContext(filteredMemories, query.context);
  }
  
  // Sort
  const sortBy = query.sortBy || 'relevance';
  filteredMemories.sort((a, b) => {
    switch (sortBy) {
      case 'recency':
        return b.created.getTime() - a.created.getTime();
      case 'accessCount':
        return b.accessCount - a.accessCount;
      case 'relevance':
      default:
        return b.relevanceScore - a.relevanceScore;
    }
  });
  
  // Apply limit
  if (query.limit) {
    filteredMemories = filteredMemories.slice(0, query.limit);
  }
  
  return filteredMemories;
}

// Score memories by context
function scoreMemoriesByContext(memories: Memory[], context: MemoryQuery['context']): Memory[] {
  return memories.map(memory => {
    let contextScore = 0;
    
    // Check task match
    if (context?.currentTask && memory.taskId === context.currentTask) {
      contextScore += 0.3;
    }
    
    // Check file overlap
    if (context?.currentFiles && memory.contextSnapshot.files) {
      const overlap = context.currentFiles.filter(file => 
        memory.contextSnapshot.files!.includes(file)
      ).length;
      contextScore += (overlap / context.currentFiles.length) * 0.2;
    }
    
    // Check recent action similarity (simplified)
    if (context?.recentActions && memory.contextSnapshot.recentActions) {
      const actionOverlap = context.recentActions.filter(action => 
        memory.contextSnapshot.recentActions!.includes(action)
      ).length;
      contextScore += (actionOverlap / context.recentActions.length) * 0.1;
    }
    
    // Update relevance score with context boost
    return {
      ...memory,
      relevanceScore: Math.min(1, memory.relevanceScore + contextScore)
    };
  });
}

// Update memory stats
async function updateStats(index: MemoryIndex): Promise<void> {
  const byTypeAccumulator: Record<string, number> & { totalMemories?: number } = {};
  
  const stats: MemoryStats = {
    totalMemories: 0,
    byType: Object.values(MemoryType).reduce((acc, type) => {
      acc[type] = index.typeIndex[type]?.length || 0;
      byTypeAccumulator.totalMemories = (byTypeAccumulator.totalMemories || 0) + acc[type];
      return acc;
    }, {} as Record<MemoryType, number>),
    byProject: Object.entries(index.projectIndex).reduce((acc, [projectId, memoryIds]) => {
      acc[projectId] = memoryIds.length;
      return acc;
    }, {} as Record<string, number>),
    averageRelevanceScore: 0,
    lastUpdated: new Date()
  };
  
  stats.totalMemories = Object.values(stats.byType).reduce((sum, count) => sum + count, 0);
  
  await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
}

// Get memory stats
export async function getMemoryStats(): Promise<MemoryStats> {
  try {
    const data = await fs.readFile(STATS_FILE, 'utf-8');
    const stats = JSON.parse(data);
    
    // Convert lastUpdated back to Date object
    if (stats.lastUpdated) {
      stats.lastUpdated = new Date(stats.lastUpdated);
    }
    
    return stats;
  } catch {
    return {
      totalMemories: 0,
      byType: Object.values(MemoryType).reduce((acc, type) => {
        acc[type] = 0;
        return acc;
      }, {} as Record<MemoryType, number>),
      byProject: {},
      averageRelevanceScore: 0,
      lastUpdated: new Date()
    };
  }
}

// Archive old memories
export async function archiveOldMemories(daysOld: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const query: MemoryQuery = {
    filters: {
      dateRange: { start: new Date(0), end: cutoffDate },
      archived: false
    }
  };
  
  const oldMemories = await queryMemories(query);
  let archivedCount = 0;
  
  for (const memory of oldMemories) {
    if (memory.relevanceScore < 0.3 && memory.accessCount < 5) {
      await updateMemory(memory.id, { archived: true });
      archivedCount++;
    }
  }
  
  return archivedCount;
}

// Decay relevance scores
export async function decayRelevanceScores(): Promise<void> {
  const allMemories = await queryMemories({});
  const now = new Date();
  
  for (const memory of allMemories) {
    if (memory.archived) continue;
    
    // Calculate days since last access
    const daysSinceAccess = (now.getTime() - memory.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
    
    // Exponential decay with access count boost
    const decayFactor = Math.exp(-daysSinceAccess / 30); // 30-day half-life
    const accessBoost = Math.log10(memory.accessCount + 1) * 0.1;
    
    const newRelevance = Math.min(1, Math.max(0, 
      memory.relevanceScore * decayFactor + accessBoost
    ));
    
    if (Math.abs(newRelevance - memory.relevanceScore) > 0.01) {
      await updateMemory(memory.id, { relevanceScore: newRelevance });
    }
  }
} 