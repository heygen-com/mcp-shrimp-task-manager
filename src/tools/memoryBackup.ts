import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { queryMemories, createMemory } from '../models/memoryModel.js';
import { Memory, MemoryType } from '../types/memory.js';

// Schema for memory export
export const exportMemoriesSchema = z.object({
  projectId: z.string().optional(),
  includeArchived: z.boolean().default(true),
  format: z.enum(['json', 'markdown']).default('json'),
  outputPath: z.string().optional()
});

// Schema for memory import
export const importMemoriesSchema = z.object({
  filePath: z.string(),
  projectId: z.string().optional(),
  overwriteExisting: z.boolean().default(false)
});

// Export memories to file
export async function exportMemories(params: z.infer<typeof exportMemoriesSchema>) {
  try {
    // Query memories
    const memories = await queryMemories({
      filters: {
        projectId: params.projectId,
        archived: params.includeArchived ? undefined : false
      }
    });
    
    if (memories.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "No memories found to export."
        }]
      };
    }
    
    // Determine output path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = params.projectId 
      ? `memories_${params.projectId}_${timestamp}.${params.format}`
      : `memories_all_${timestamp}.${params.format}`;
    const outputPath = params.outputPath || path.join(process.cwd(), filename);
    
    let content: string;
    
    if (params.format === 'json') {
      // Export as JSON
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        projectId: params.projectId,
        totalMemories: memories.length,
        memories: memories.map(m => ({
          ...m,
          created: m.created.toISOString(),
          lastAccessed: m.lastAccessed.toISOString(),
          lastUpdated: m.lastUpdated?.toISOString()
        }))
      };
      
      content = JSON.stringify(exportData, null, 2);
    } else {
      // Export as Markdown
      content = generateMarkdownExport(memories, params.projectId);
    }
    
    // Write to file
    await fs.writeFile(outputPath, content, 'utf-8');
    
    return {
      content: [{
        type: "text" as const,
        text: `Successfully exported ${memories.length} memories to:\n${outputPath}\n\n` +
              `Format: ${params.format}\n` +
              `Project: ${params.projectId || 'All projects'}\n` +
              `Included archived: ${params.includeArchived}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error exporting memories: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Import memories from file
export async function importMemories(params: z.infer<typeof importMemoriesSchema>) {
  try {
    // Read file
    const fileContent = await fs.readFile(params.filePath, 'utf-8');
    
    let importData: {
      version: string;
      memories: Array<Record<string, unknown>>;
      exportDate?: string;
      projectId?: string;
      totalMemories?: number;
    };
    
    try {
      importData = JSON.parse(fileContent);
    } catch {
      return {
        content: [{
          type: "text" as const,
          text: "Error: File must be in JSON format exported by the memory system."
        }]
      };
    }
    
    // Validate format
    if (!importData.version || !importData.memories || !Array.isArray(importData.memories)) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: Invalid import file format. Please use a file exported by the memory system."
        }]
      };
    }
    
    // Import memories
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    for (const memoryData of importData.memories) {
      try {
        // Convert date strings back to dates
        const memory: Partial<Memory> & Record<string, unknown> = {
          ...memoryData,
          created: new Date(memoryData.created as string),
          lastAccessed: new Date(memoryData.lastAccessed as string),
          lastUpdated: memoryData.lastUpdated ? new Date(memoryData.lastUpdated as string) : undefined
        };
        
        // Override project ID if specified
        if (params.projectId) {
          memory.projectId = params.projectId;
        }
        
        // Create the memory (without the fields that createMemory will add)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, version, created, lastAccessed, accessCount, relevanceScore, ...memoryToCreate } = memory;
        
        await createMemory({
          ...memoryToCreate,
          type: memory.type as MemoryType
        } as Parameters<typeof createMemory>[0]);
        
        imported++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to import memory "${(memoryData as Record<string, unknown>).summary}": ${errorMsg}`);
        skipped++;
      }
    }
    
    // Generate report
    let report = `Import completed:\n\n`;
    report += `- Successfully imported: ${imported} memories\n`;
    report += `- Skipped/Failed: ${skipped} memories\n`;
    
    if (params.projectId) {
      report += `- All memories assigned to project: ${params.projectId}\n`;
    }
    
    if (errors.length > 0) {
      report += `\nErrors:\n${errors.slice(0, 10).join('\n')}`;
      if (errors.length > 10) {
        report += `\n... and ${errors.length - 10} more errors`;
      }
    }
    
    return {
      content: [{
        type: "text" as const,
        text: report
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error importing memories: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Generate markdown export
function generateMarkdownExport(memories: Memory[], projectId?: string): string {
  let markdown = `# Memory Export\n\n`;
  markdown += `**Export Date:** ${new Date().toISOString()}\n`;
  markdown += `**Project:** ${projectId || 'All projects'}\n`;
  markdown += `**Total Memories:** ${memories.length}\n\n`;
  
  // Group by type
  const byType = memories.reduce((acc, m) => {
    if (!acc[m.type]) acc[m.type] = [];
    acc[m.type].push(m);
    return acc;
  }, {} as Record<MemoryType, Memory[]>);
  
  // Export each type
  for (const [type, typeMemories] of Object.entries(byType)) {
    markdown += `## ${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')} (${typeMemories.length})\n\n`;
    
    for (const memory of typeMemories) {
      markdown += `### ${memory.summary}\n\n`;
      markdown += `- **ID:** ${memory.id}\n`;
      markdown += `- **Created:** ${memory.created.toISOString()}\n`;
      markdown += `- **Confidence:** ${memory.confidence}\n`;
      markdown += `- **Relevance:** ${memory.relevanceScore.toFixed(2)}\n`;
      markdown += `- **Access Count:** ${memory.accessCount}\n`;
      
      if (memory.tags.length > 0) {
        markdown += `- **Tags:** ${memory.tags.join(', ')}\n`;
      }
      
      if (memory.archived) {
        markdown += `- **Status:** ARCHIVED\n`;
      }
      
      markdown += `\n**Content:**\n${memory.content}\n\n`;
      
      if (memory.entities && memory.entities.length > 0) {
        markdown += `**Entities:** ${memory.entities.join(', ')}\n\n`;
      }
      
      markdown += `---\n\n`;
    }
  }
  
  return markdown;
} 