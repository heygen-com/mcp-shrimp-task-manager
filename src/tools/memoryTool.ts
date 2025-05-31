import { z } from 'zod';
import { MemoryType, MemoryQuery, Memory } from '../types/memory.js';
import {
  createMemory,
  getMemory,
  updateMemory,
  deleteMemory,
  queryMemories,
  getMemoryStats,
  archiveOldMemories,
  decayRelevanceScores
} from '../models/memoryModel.js';
import crypto from 'crypto';
import { findMemoryChains, consolidateMemories, extractEntities } from '../utils/memoryUtils.js';

// Schema for recording a memory
export const recordMemorySchema = z.object({
  content: z.string().min(10, "Memory content must be at least 10 characters"),
  summary: z.string().min(5, "Memory summary must be at least 5 characters"),
  type: z.enum(['breakthrough', 'decision', 'feedback', 'error_recovery', 'pattern', 'user_preference']),
  confidence: z.number().min(0).max(1).default(0.8),
  tags: z.array(z.string()).default([]),
  entities: z.array(z.string()).optional(),
  relatedMemories: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  contextSnapshot: z.object({
    files: z.array(z.string()).optional(),
    recentActions: z.array(z.string()).optional(),
    environmentState: z.record(z.unknown()).optional(),
    taskContext: z.object({
      taskId: z.string().optional(),
      taskName: z.string().optional(),
      taskStatus: z.string().optional()
    }).optional()
  }).default({}),
  metadata: z.record(z.unknown()).default({})
});

// Schema for querying memories
export const queryMemorySchema = z.object({
  filters: z.object({
    projectId: z.string().optional(),
    types: z.array(z.enum(['breakthrough', 'decision', 'feedback', 'error_recovery', 'pattern', 'user_preference'])).optional(),
    tags: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.string().transform(str => new Date(str)),
      end: z.string().transform(str => new Date(str))
    }).optional(),
    minRelevance: z.number().min(0).max(1).optional(),
    archived: z.boolean().optional()
  }).optional(),
  searchText: z.string().optional(),
  context: z.object({
    currentTask: z.string().optional(),
    currentFiles: z.array(z.string()).optional(),
    recentActions: z.array(z.string()).optional()
  }).optional(),
  limit: z.number().positive().max(100).default(20),
  includeChains: z.boolean().default(false),
  sortBy: z.enum(['relevance', 'recency', 'accessCount']).default('relevance')
});

// Schema for updating a memory
export const updateMemorySchema = z.object({
  memoryId: z.string().min(1, "Memory ID is required"),
  updates: z.object({
    content: z.string().optional(),
    summary: z.string().optional(),
    tags: z.array(z.string()).optional(),
    entities: z.array(z.string()).optional(),
    relatedMemories: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional()
  })
});

// Schema for deleting a memory
export const deleteMemorySchema = z.object({
  memoryId: z.string().min(1, "Memory ID is required")
});

// Schema for memory maintenance operations
export const memoryMaintenanceSchema = z.object({
  operation: z.enum(['archive_old', 'decay_scores', 'get_stats']),
  daysOld: z.number().positive().default(90).optional()
});

// Schema for getting memory chains
export const getMemoryChainSchema = z.object({
  memoryId: z.string().min(1, "Memory ID is required"),
  depth: z.number().positive().max(5).default(2),
  includeContent: z.boolean().default(false)
});

// Helper to generate content hash for duplicate detection
function generateContentHash(content: string, type: MemoryType): string {
  return crypto.createHash('sha256')
    .update(`${type}:${content.toLowerCase().trim()}`)
    .digest('hex')
    .substring(0, 16);
}

// Helper to check for duplicates within time window
async function checkForDuplicates(
  content: string,
  type: MemoryType,
  projectId?: string,
  windowMinutes: number = 5
): Promise<{ isDuplicate: boolean; similarMemory?: Memory }> {
  const contentHash = generateContentHash(content, type);
  const windowStart = new Date();
  windowStart.setMinutes(windowStart.getMinutes() - windowMinutes);
  
  const recentMemories = await queryMemories({
    filters: {
      projectId,
      types: [type],
      dateRange: { start: windowStart, end: new Date() }
    }
  });
  
  // Check for exact duplicates
  for (const memory of recentMemories) {
    const memoryHash = generateContentHash(memory.content, memory.type);
    if (memoryHash === contentHash) {
      return { isDuplicate: true, similarMemory: memory };
    }
    
    // Check for high similarity (simple check - could be enhanced with embeddings)
    const similarity = calculateSimpleSimilarity(content, memory.content);
    if (similarity > 0.85) {
      return { isDuplicate: true, similarMemory: memory };
    }
  }
  
  return { isDuplicate: false };
}

// Simple similarity calculation (Jaccard similarity on words)
function calculateSimpleSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

// Record a new memory
export async function recordMemory(params: z.infer<typeof recordMemorySchema>) {
  try {
    // Extract entities from content
    const entities = extractEntities(params.content);
    
    // Check for duplicates
    const { isDuplicate, similarMemory } = await checkForDuplicates(
      params.content,
      params.type as MemoryType,
      params.projectId
    );
    
    if (isDuplicate && similarMemory) {
      return {
        content: [{
          type: "text" as const,
          text: `A similar memory already exists (created ${similarMemory.created.toISOString()}):\n\n` +
                `Type: ${similarMemory.type}\n` +
                `Summary: ${similarMemory.summary}\n\n` +
                `The new memory was not created to avoid duplication. ` +
                `Consider updating the existing memory if you have additional insights.`
        }]
      };
    }
    
    // Create the memory with extracted entities
    const memory = await createMemory({
      content: params.content,
      summary: params.summary,
      type: params.type as MemoryType,
      confidence: params.confidence,
      tags: params.tags,
      entities: [...(params.entities || []), ...entities], // Combine provided and extracted entities
      relatedMemories: params.relatedMemories || [],
      projectId: params.projectId,
      taskId: params.taskId,
      contextSnapshot: params.contextSnapshot,
      author: 'agent',
      metadata: params.metadata,
      triggerContext: `Manual recording via memory tool`
    });
    
    return {
      content: [{
        type: "text" as const,
        text: `Memory recorded successfully!\n\n` +
              `ID: ${memory.id}\n` +
              `Type: ${memory.type}\n` +
              `Summary: ${memory.summary}\n` +
              `Project: ${params.projectId || 'Global'}\n` +
              `Task: ${params.taskId || 'None'}\n` +
              `Tags: ${memory.tags.join(', ') || 'None'}\n` +
              `Entities: ${memory.entities?.join(', ') || 'None'}\n` +
              `Confidence: ${memory.confidence}\n` +
              `Relevance Score: ${memory.relevanceScore}\n\n` +
              `The memory has been stored and indexed for future retrieval.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error recording memory: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Query memories
export async function queryMemory(params: z.infer<typeof queryMemorySchema>) {
  try {
    const query: MemoryQuery = {
      ...params,
      filters: params.filters ? {
        ...params.filters,
        types: params.filters.types as MemoryType[] | undefined
      } : undefined
    };
    
    const memories = await queryMemories(query);
    
    if (memories.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "No memories found matching your query."
        }]
      };
    }
    
    const memoryList = memories.map((m, i) => 
      `${i + 1}. [${m.type.toUpperCase()}] ${m.summary}\n` +
      `   ID: ${m.id} | Created: ${m.created.toISOString()}\n` +
      `   Relevance: ${m.relevanceScore.toFixed(2)} | Access Count: ${m.accessCount}\n` +
      `   Tags: ${m.tags.join(', ') || 'None'}\n` +
      `   ${m.archived ? '📦 ARCHIVED' : ''}`
    ).join('\n\n');
    
    return {
      content: [{
        type: "text" as const,
        text: `Found ${memories.length} memories:\n\n${memoryList}\n\n` +
              `Use 'get_memory' with a specific ID to view full content.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error querying memories: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Get a specific memory
export async function getMemoryById(memoryId: string) {
  try {
    const memory = await getMemory(memoryId);
    
    if (!memory) {
      return {
        content: [{
          type: "text" as const,
          text: `Memory with ID ${memoryId} not found.`
        }]
      };
    }
    
    return {
      content: [{
        type: "text" as const,
        text: `Memory Details:\n\n` +
              `ID: ${memory.id}\n` +
              `Type: ${memory.type}\n` +
              `Version: ${memory.version}\n` +
              `Created: ${memory.created.toISOString()}\n` +
              `Last Accessed: ${memory.lastAccessed.toISOString()}\n` +
              `Access Count: ${memory.accessCount}\n` +
              `Relevance Score: ${memory.relevanceScore.toFixed(2)}\n` +
              `Confidence: ${memory.confidence}\n` +
              `Archived: ${memory.archived ? 'Yes' : 'No'}\n\n` +
              `Summary: ${memory.summary}\n\n` +
              `Content:\n${memory.content}\n\n` +
              `Tags: ${memory.tags.join(', ') || 'None'}\n` +
              `Entities: ${memory.entities?.join(', ') || 'None'}\n` +
              `Related Memories: ${memory.relatedMemories.join(', ') || 'None'}\n\n` +
              `Context Snapshot:\n${JSON.stringify(memory.contextSnapshot, null, 2)}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error retrieving memory: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Update a memory
export async function updateMemoryContent(params: z.infer<typeof updateMemorySchema>) {
  try {
    const updatedMemory = await updateMemory(params.memoryId, params.updates);
    
    if (!updatedMemory) {
      return {
        content: [{
          type: "text" as const,
          text: `Memory with ID ${params.memoryId} not found.`
        }]
      };
    }
    
    return {
      content: [{
        type: "text" as const,
        text: `Memory updated successfully!\n\n` +
              `ID: ${updatedMemory.id}\n` +
              `Version: ${updatedMemory.version} (incremented)\n` +
              `Last Updated: ${updatedMemory.lastUpdated?.toISOString()}\n\n` +
              `The memory has been versioned and the previous version is preserved.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error updating memory: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Delete a memory
export async function deleteMemoryById(params: z.infer<typeof deleteMemorySchema>) {
  try {
    const success = await deleteMemory(params.memoryId);
    
    if (!success) {
      return {
        content: [{
          type: "text" as const,
          text: `Memory with ID ${params.memoryId} not found or could not be deleted.`
        }]
      };
    }
    
    return {
      content: [{
        type: "text" as const,
        text: `Memory ${params.memoryId} has been successfully deleted.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error deleting memory: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Memory maintenance operations
export async function memoryMaintenance(params: z.infer<typeof memoryMaintenanceSchema>) {
  try {
    switch (params.operation) {
      case 'archive_old': {
        const count = await archiveOldMemories(params.daysOld);
        return {
          content: [{
            type: "text" as const,
            text: `Archived ${count} old memories (older than ${params.daysOld} days with low relevance/access).`
          }]
        };
      }
      
      case 'decay_scores': {
        await decayRelevanceScores();
        return {
          content: [{
            type: "text" as const,
            text: `Relevance scores have been updated based on time decay and access patterns.`
          }]
        };
      }
      
      case 'get_stats': {
        const stats = await getMemoryStats();
        return {
          content: [{
            type: "text" as const,
            text: `Memory System Statistics:\n\n` +
                  `Total Memories: ${stats.totalMemories}\n\n` +
                  `By Type:\n${Object.entries(stats.byType).map(([type, count]) => 
                    `  ${type}: ${count}`).join('\n')}\n\n` +
                  `By Project:\n${Object.entries(stats.byProject).map(([proj, count]) => 
                    `  ${proj}: ${count}`).join('\n') || '  None'}\n\n` +
                  `Average Relevance Score: ${stats.averageRelevanceScore.toFixed(2)}\n` +
                  `Last Updated: ${stats.lastUpdated.toISOString()}`
          }]
        };
      }
    }
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error in maintenance operation: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Get memory chain - retrieve related memories
export async function getMemoryChain(params: z.infer<typeof getMemoryChainSchema>) {
  try {
    const rootMemory = await getMemory(params.memoryId);
    
    if (!rootMemory) {
      return {
        content: [{
          type: "text" as const,
          text: `Memory with ID ${params.memoryId} not found.`
        }]
      };
    }
    
    // Start with the root memory's related memories
    const visited = new Set<string>([rootMemory.id]);
    const chain: Memory[] = [rootMemory];
    const toVisit = [...rootMemory.relatedMemories];
    
    // Breadth-first search for related memories
    let currentDepth = 1;
    while (toVisit.length > 0 && currentDepth <= params.depth) {
      const currentLevel = [...toVisit];
      toVisit.length = 0;
      
      for (const memoryId of currentLevel) {
        if (visited.has(memoryId)) continue;
        
        const memory = await getMemory(memoryId);
        if (memory) {
          visited.add(memoryId);
          chain.push(memory);
          
          // Add this memory's related memories for next level
          if (currentDepth < params.depth) {
            toVisit.push(...memory.relatedMemories.filter(id => !visited.has(id)));
          }
        }
      }
      
      currentDepth++;
    }
    
    // Also find memories with similar content or shared tags
    const allMemories = await queryMemories({
      filters: {
        projectId: rootMemory.projectId,
        types: [rootMemory.type]
      }
    });
    
    const chains = findMemoryChains(allMemories);
    const rootChain = chains.get(rootMemory.id) || [];
    
    // Add memories from the auto-detected chain
    for (const memoryId of rootChain) {
      if (!visited.has(memoryId)) {
        const memory = await getMemory(memoryId);
        if (memory) {
          chain.push(memory);
          visited.add(memoryId);
        }
      }
    }
    
    // Sort by relevance to root memory
    chain.sort((a, b) => {
      if (a.id === rootMemory.id) return -1;
      if (b.id === rootMemory.id) return 1;
      
      // Calculate similarity to root
      const aTags = new Set(a.tags);
      const bTags = new Set(b.tags);
      const rootTags = new Set(rootMemory.tags);
      
      const aShared = [...rootTags].filter(tag => aTags.has(tag)).length;
      const bShared = [...rootTags].filter(tag => bTags.has(tag)).length;
      
      return bShared - aShared;
    });
    
    // Format output
    let output = `## Memory Chain for "${rootMemory.summary}"\n\n`;
    output += `Found ${chain.length} related memories:\n\n`;
    
    for (const [index, memory] of chain.entries()) {
      const relationship = index === 0 ? 'ROOT' : 
        rootMemory.relatedMemories.includes(memory.id) ? 'DIRECT' : 'INDIRECT';
      
      output += `### ${index + 1}. [${relationship}] ${memory.summary}\n`;
      output += `- **Type:** ${memory.type}\n`;
      output += `- **Created:** ${memory.created.toISOString()}\n`;
      output += `- **Tags:** ${memory.tags.join(', ') || 'None'}\n`;
      
      if (params.includeContent) {
        output += `- **Content Preview:** ${memory.content.substring(0, 200)}...\n`;
      }
      
      output += '\n';
    }
    
    return {
      content: [{
        type: "text" as const,
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error retrieving memory chain: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Consolidate similar memories
export async function consolidateMemoriesAction() {
  try {
    const allMemories = await queryMemories({});
    const { consolidated, mergeMap } = consolidateMemories(allMemories);
    
    // Update the memories with consolidation info
    let consolidatedCount = 0;
    for (const mergedIds of mergeMap.values()) {
      if (mergedIds.length > 1) {
        consolidatedCount++;
        // You might want to actually update the database here
        // For now, we'll just report what would be consolidated
      }
    }
    
    return {
      content: [{
        type: "text" as const,
        text: `Memory Consolidation Report:\n\n` +
              `Total memories analyzed: ${allMemories.length}\n` +
              `Memories that would be consolidated: ${consolidatedCount}\n` +
              `Total memories after consolidation: ${consolidated.length}\n\n` +
              `Run with 'confirm' parameter to actually consolidate memories.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error consolidating memories: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
} 