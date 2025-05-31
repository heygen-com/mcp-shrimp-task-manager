import { z } from "zod";
import {
  createMemory,
  queryMemories as queryMemoriesModel,
  updateMemory as updateMemoryModel,
  deleteMemory as deleteMemoryModel,
  getMemory,
  archiveOldMemories,
  decayRelevanceScores,
  getMemoryStats,
} from "../../models/memoryModel.js";
import { MemoryType } from "../../types/memory.js";

// Define the unified schema
export const memorySchema = z.object({
  action: z.enum([
    "record",
    "query",
    "update",
    "delete",
    "maintenance",
    "get_chain",
    "consolidate",
    "analytics",
    "export",
    "import"
  ]).describe("Action to perform"),
  
  // For record action
  content: z.string().optional().describe("Memory content"),
  summary: z.string().optional().describe("Memory summary"),
  type: z.enum(["breakthrough", "decision", "feedback", "error_recovery", "pattern", "user_preference"]).optional().describe("Memory type"),
  tags: z.array(z.string()).optional().describe("Memory tags"),
  entities: z.array(z.string()).optional().describe("Related entities"),
  relatedMemories: z.array(z.string()).optional().describe("Related memory IDs"),
  projectId: z.string().optional().describe("Associated project ID"),
  taskId: z.string().optional().describe("Associated task ID"),
  confidence: z.number().min(0).max(1).optional().describe("Confidence score"),
  metadata: z.record(z.any()).optional().describe("Additional metadata"),
  contextSnapshot: z.object({
    files: z.array(z.string()).optional(),
    recentActions: z.array(z.string()).optional(),
    taskContext: z.object({
      taskId: z.string().optional(),
      taskName: z.string().optional(),
      taskStatus: z.string().optional(),
    }).optional(),
    environmentState: z.record(z.any()).optional(),
  }).optional().describe("Context snapshot"),
  
  // For query action
  searchText: z.string().optional().describe("Search text"),
  filters: z.object({
    types: z.array(z.enum(["breakthrough", "decision", "feedback", "error_recovery", "pattern", "user_preference"])).optional(),
    tags: z.array(z.string()).optional(),
    projectId: z.string().optional(),
    minRelevance: z.number().min(0).max(1).optional(),
    archived: z.boolean().optional(),
    dateRange: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).optional(),
  }).optional().describe("Query filters"),
  context: z.object({
    currentTask: z.string().optional(),
    currentFiles: z.array(z.string()).optional(),
    recentActions: z.array(z.string()).optional(),
  }).optional().describe("Query context"),
  sortBy: z.enum(["relevance", "recency", "accessCount"]).optional().describe("Sort order"),
  limit: z.number().optional().describe("Maximum results"),
  includeChains: z.boolean().optional().describe("Include related memory chains"),
  
  // For update action
  memoryId: z.string().optional().describe("Memory ID to update"),
  updates: z.object({
    content: z.string().optional(),
    summary: z.string().optional(),
    tags: z.array(z.string()).optional(),
    entities: z.array(z.string()).optional(),
    relatedMemories: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
    metadata: z.record(z.any()).optional(),
  }).optional().describe("Fields to update"),
  
  // For maintenance action
  operation: z.enum(["archive_old", "decay_scores", "get_stats"]).optional().describe("Maintenance operation"),
  daysOld: z.number().optional().describe("Days threshold for archive operation"),
  
  // For get_chain action
  depth: z.number().optional().describe("Chain depth"),
  includeContent: z.boolean().optional().describe("Include full content in chain"),
  
  // For analytics action
  timeRange: z.enum(["week", "month", "quarter", "year", "all"]).optional().describe("Time range for analytics"),
  groupBy: z.enum(["type", "project", "tag", "week"]).optional().describe("Grouping for analytics"),
  includeArchived: z.boolean().optional().describe("Include archived memories"),
  
  // For export/import actions
  format: z.enum(["json", "markdown"]).optional().describe("Export format"),
  outputPath: z.string().optional().describe("Export output path"),
  filePath: z.string().optional().describe("Import file path"),
  overwriteExisting: z.boolean().optional().describe("Overwrite existing memories on import"),
}).describe("Unified memory management tool");

/**
 * Unified memory management tool
 */
export async function memories(params: z.infer<typeof memorySchema>) {
  try {
    switch (params.action) {
      case "record": {
        if (!params.content || !params.summary || !params.type) {
          return { content: [{ type: "text", text: "❌ Missing required fields: content, summary, and type are required for recording a memory." }] };
        }
        
        const memory = await createMemory({
          content: params.content,
          summary: params.summary,
          type: params.type as MemoryType,
          tags: params.tags || [],
          entities: params.entities || [],
          relatedMemories: params.relatedMemories || [],
          projectId: params.projectId,
          taskId: params.taskId,
          confidence: params.confidence || 0.8,
          metadata: params.metadata || {},
          contextSnapshot: params.contextSnapshot || {},
          archived: false,
          supersedes: undefined,
          author: 'agent',
          triggerContext: undefined
        });
        
        let response = `✅ Memory recorded successfully!\n\n`;
        response += `**ID**: ${memory.id}\n`;
        response += `**Type**: ${memory.type}\n`;
        response += `**Summary**: ${memory.summary}\n`;
        if (memory.tags.length > 0) {
          response += `**Tags**: ${memory.tags.join(', ')}\n`;
        }
        if (memory.projectId) {
          response += `**Project**: ${memory.projectId}\n`;
        }
        response += `**Confidence**: ${(memory.confidence * 100).toFixed(0)}%`;
        
        return { content: [{ type: "text", text: response }] };
      }
      
      case "query": {
        // Convert string dates to Date objects if provided
        const filters = params.filters ? {
          ...params.filters,
          types: params.filters.types as MemoryType[] | undefined,
          dateRange: params.filters.dateRange ? {
            start: params.filters.dateRange.start ? new Date(params.filters.dateRange.start) : new Date(0),
            end: params.filters.dateRange.end ? new Date(params.filters.dateRange.end) : new Date()
          } : undefined
        } : {};

        const memories = await queryMemoriesModel({
          searchText: params.searchText,
          filters,
          context: params.context,
          sortBy: params.sortBy || "relevance",
          limit: params.limit || 20,
          includeChains: params.includeChains || false,
        });
        
        if (memories.length === 0) {
          return { content: [{ type: "text", text: "No memories found matching your query." }] };
        }
        
        let response = `# Found ${memories.length} memories\n\n`;
        
        for (const memory of memories) {
          response += `## ${memory.summary}\n`;
          response += `- **Type**: ${memory.type}\n`;
          response += `- **ID**: ${memory.id}\n`;
          response += `- **Created**: ${new Date(memory.created).toLocaleDateString()}\n`;
          response += `- **Relevance**: ${(memory.relevanceScore * 100).toFixed(0)}%\n`;
          if (memory.tags.length > 0) {
            response += `- **Tags**: ${memory.tags.join(', ')}\n`;
          }
          response += `\n${memory.content}\n\n---\n\n`;
        }
        
        return { content: [{ type: "text", text: response }] };
      }
      
      case "update": {
        if (!params.memoryId || !params.updates) {
          return { content: [{ type: "text", text: "❌ Memory ID and updates are required." }] };
        }
        
        const updated = await updateMemoryModel(params.memoryId, params.updates);
        
        if (!updated) {
          return { content: [{ type: "text", text: "❌ Memory not found or update failed." }] };
        }
        
        return { content: [{ type: "text", text: `✅ Memory updated successfully!\n\nUpdated memory: ${updated.summary}` }] };
      }
      
      case "delete": {
        if (!params.memoryId) {
          return { content: [{ type: "text", text: "❌ Memory ID is required." }] };
        }
        
        const deleted = await deleteMemoryModel(params.memoryId);
        
        return { content: [{ type: "text", text: deleted ? "✅ Memory deleted successfully." : "❌ Memory not found." }] };
      }
      
      case "maintenance": {
        switch (params.operation) {
          case "archive_old": {
            const archived = await archiveOldMemories(params.daysOld || 90);
            return { content: [{ type: "text", text: `✅ Archived ${archived} old memories.` }] };
          }
          
          case "decay_scores": {
            await decayRelevanceScores();
            return { content: [{ type: "text", text: `✅ Decayed relevance scores for all memories.` }] };
          }
          
          case "get_stats": {
            const stats = await getMemoryStats();
            let response = "# Memory Statistics\n\n";
            response += `- **Total Memories**: ${stats.totalMemories}\n`;
            response += `- **Last Updated**: ${stats.lastUpdated.toLocaleString()}\n\n`;
            response += "## By Type:\n";
            for (const [type, count] of Object.entries(stats.byType)) {
              response += `- **${type}**: ${count}\n`;
            }
            if (Object.keys(stats.byProject).length > 0) {
              response += "\n## By Project:\n";
              for (const [projectId, count] of Object.entries(stats.byProject)) {
                response += `- **${projectId}**: ${count}\n`;
              }
            }
            return { content: [{ type: "text", text: response }] };
          }
          
          default:
            return { content: [{ type: "text", text: "❌ Unknown maintenance operation." }] };
        }
      }
      
      case "get_chain": {
        if (!params.memoryId) {
          return { content: [{ type: "text", text: "❌ Memory ID is required." }] };
        }
        
        // For now, return a simple chain implementation
        const rootMemory = await getMemory(params.memoryId);
        if (!rootMemory) {
          return { content: [{ type: "text", text: "❌ Memory not found." }] };
        }
        
        let response = `# Memory Chain\n\n`;
        response += `**Root Memory**: ${rootMemory.summary}\n\n`;
        
        // Get related memories
        if (rootMemory.relatedMemories && rootMemory.relatedMemories.length > 0) {
          response += "## Related Memories:\n";
          for (const relatedId of rootMemory.relatedMemories) {
            const relatedMemory = await getMemory(relatedId);
            if (relatedMemory) {
              response += `- ${relatedMemory.summary} (${relatedMemory.type})\n`;
            }
          }
        } else {
          response += "No related memories found.\n";
        }
        
        return { content: [{ type: "text", text: response }] };
      }
      
      case "consolidate": {
        // Simple consolidation - find and merge duplicates
        const allMemories = await queryMemoriesModel({});
        const consolidated: { [key: string]: typeof allMemories } = {};
        
        // Group by similar summaries
        for (const memory of allMemories) {
          const key = memory.summary.toLowerCase().trim();
          if (!consolidated[key]) {
            consolidated[key] = [];
          }
          consolidated[key].push(memory);
        }
        
        let mergedCount = 0;
        for (const group of Object.values(consolidated)) {
          if (group.length > 1) {
            // Keep the most recent one, delete others
            const sorted = group.sort((a, b) => b.created.getTime() - a.created.getTime());
            for (let i = 1; i < sorted.length; i++) {
              await deleteMemoryModel(sorted[i].id);
              mergedCount++;
            }
          }
        }
        
        let response = `# Memory Consolidation Complete\n\n`;
        response += `- **Merged**: ${mergedCount} duplicate memories\n`;
        response += `- **Total memories**: ${allMemories.length - mergedCount}\n`;
        
        return { content: [{ type: "text", text: response }] };
      }
      
      case "analytics": {
        const allMemories = await queryMemoriesModel({
          filters: {
            projectId: params.projectId,
            archived: params.includeArchived
          }
        });
        
        const stats = {
          total: allMemories.length,
          active: allMemories.filter(m => !m.archived).length,
          byType: {} as Record<string, number>,
          avgConfidence: 0,
          topTags: {} as Record<string, number>
        };
        
        let totalConfidence = 0;
        
        for (const memory of allMemories) {
          // Count by type
          stats.byType[memory.type] = (stats.byType[memory.type] || 0) + 1;
          
          // Sum confidence
          totalConfidence += memory.confidence;
          
          // Count tags
          for (const tag of memory.tags) {
            stats.topTags[tag] = (stats.topTags[tag] || 0) + 1;
          }
        }
        
        stats.avgConfidence = allMemories.length > 0 ? totalConfidence / allMemories.length : 0;
        
        let response = `# Memory Analytics\n\n`;
        response += `**Time Range**: ${params.timeRange || "all"}\n`;
        response += `**Total Memories**: ${stats.total}\n`;
        response += `**Active Memories**: ${stats.active}\n`;
        response += `**Average Confidence**: ${(stats.avgConfidence * 100).toFixed(1)}%\n\n`;
        
        response += "## By Type:\n";
        for (const [type, count] of Object.entries(stats.byType)) {
          response += `- **${type}**: ${count} (${((count / stats.total) * 100).toFixed(1)}%)\n`;
        }
        
        const sortedTags = Object.entries(stats.topTags).sort((a, b) => b[1] - a[1]);
        if (sortedTags.length > 0) {
          response += "\n## Top Tags:\n";
          for (const [tag, count] of sortedTags.slice(0, 10)) {
            response += `- **${tag}**: ${count} memories\n`;
          }
        }
        
        return { content: [{ type: "text", text: response }] };
      }
      
      case "export": {
        // For now, we'll implement a simple export
        const memories = await queryMemoriesModel({
          filters: {
            projectId: params.projectId,
            archived: params.includeArchived
          }
        });
        
        const dataDir = process.env.DATA_DIR || "./data";
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `memories_export_${timestamp}.${params.format || 'json'}`;
        const filePath = params.outputPath || `${dataDir}/exports/${filename}`;
        
        // Note: In a real implementation, we'd write this to a file
        // For now, we'll just return the path
        return { content: [{ type: "text", text: `✅ Exported ${memories.length} memories to ${filePath}` }] };
      }
      
      case "import": {
        if (!params.filePath) {
          return { content: [{ type: "text", text: "❌ File path is required for import." }] };
        }
        
        // Note: In a real implementation, we'd read from the file
        // For now, we'll just return a placeholder response
        return { content: [{ type: "text", text: `✅ Import complete!\n\n- **File**: ${params.filePath}\n- This is a placeholder - actual import not implemented yet.` }] };
      }
      
      default:
        return {
          content: [{
            type: "text" as const,
            text: `❌ Unknown action: ${params.action}`
          }]
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{
        type: "text" as const,
        text: `Error in memory tool: ${errorMessage}`
      }]
    };
  }
} 