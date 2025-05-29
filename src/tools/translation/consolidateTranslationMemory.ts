import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Define the input schema
export const ConsolidateTranslationMemoryInputSchema = z.object({
  sourceLanguage: z.string().default('en').describe('Source language code (default: "en")'),
  targetLanguage: z.string().describe('Target language code (e.g., "ko", "pt-BR", "es-MS")'),
  cleanupDialogs: z.boolean().default(false).describe('If true, removes processed dialog files after consolidation'),
  dryRun: z.boolean().default(false).describe('If true, shows what would be consolidated without making changes')
});

// Add DialogTurn interface
interface DialogTurn {
  role: string;
  content: string;
  timestamp: string | Date;
}

interface TranslationMemoryEntry {
  id: string;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: string;
  domain?: string;
  confidence: number;
  usageCount: number;
  lastUsed: Date;
  created: Date;
  dialog?: DialogTurn[];
}

interface DialogData {
  id: string;
  turns: DialogTurn[];
  sourceContent: string;
  targetLanguage: string;
  status: string;
  finalTranslation?: string;
  created: string;
  lastUpdated: string;
}

// Get translation memory directory
async function getTranslationMemoryDir(): Promise<string> {
  const dataDir = process.env.DATA_DIR || path.join(PROJECT_ROOT, "data");
  const memoryDir = path.join(dataDir, 'translation_memory');
  return memoryDir;
}

// Revive dates in objects
function reviveDates<T extends object>(obj: T): T {
  if ('lastUsed' in obj && typeof (obj as { lastUsed: unknown }).lastUsed === 'string') {
    (obj as { lastUsed: Date }).lastUsed = new Date((obj as { lastUsed: string }).lastUsed);
  }
  if ('created' in obj && typeof (obj as { created: unknown }).created === 'string') {
    (obj as { created: Date }).created = new Date((obj as { created: string }).created);
  }
  if ('lastUpdated' in obj && typeof (obj as { lastUpdated: unknown }).lastUpdated === 'string') {
    (obj as { lastUpdated: Date }).lastUpdated = new Date((obj as { lastUpdated: string }).lastUpdated);
  }
  return obj;
}

// Extract translation from dialog
function extractTranslationFromDialog(dialog: DialogData): {
  sourceText: string;
  targetText: string;
  confidence: number;
  context?: string;
  domain?: string;
} | null {
  try {
    // Find the translation response in dialog turns
    for (const turn of dialog.turns) {
      if (turn.role === 'secondary' && turn.content) {
        try {
          const response = typeof turn.content === 'string' ? JSON.parse(turn.content) : turn.content;
          if (response.translation) {
            // Extract context from primary turn
            let context = '';
            const domain = 'general';
            
            const primaryTurn = dialog.turns.find(t => t.role === 'primary');
            if (primaryTurn && primaryTurn.content) {
              const contextMatch = primaryTurn.content.match(/\(([^)]+)\)/);
              if (contextMatch) {
                context = contextMatch[1];
              }
            }
            
            return {
              sourceText: dialog.sourceContent,
              targetText: response.translation,
              confidence: response.confidence || 0.9,
              context,
              domain: response.domain || domain
            };
          }
        } catch {
          // Continue to next turn
        }
      }
    }
    
    // If dialog has finalTranslation, use it
    if (dialog.finalTranslation) {
      return {
        sourceText: dialog.sourceContent,
        targetText: dialog.finalTranslation,
        confidence: 0.95,
        context: '',
        domain: 'general'
      };
    }
  } catch (e) {
    console.error('Error extracting translation from dialog:', e);
  }
  
  return null;
}

// Main consolidation function
export async function consolidateTranslationMemory(
  params: z.infer<typeof ConsolidateTranslationMemoryInputSchema>
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    const { sourceLanguage, targetLanguage, cleanupDialogs, dryRun } = params;
    
    const memoryDir = await getTranslationMemoryDir();
    const dialogsDir = path.join(memoryDir, 'dialogs');
    const memoryFile = path.join(memoryDir, `${sourceLanguage}_to_${targetLanguage}.json`);
    
    let report = `# Translation Memory Consolidation Report\n\n`;
    report += `**Source Language:** ${sourceLanguage}\n`;
    report += `**Target Language:** ${targetLanguage}\n`;
    report += `**Mode:** ${dryRun ? 'DRY RUN' : 'LIVE'}\n\n`;
    
    // Load existing translation memory
    let existingMemory: TranslationMemoryEntry[] = [];
    try {
      const data = await fs.readFile(memoryFile, 'utf-8');
      existingMemory = JSON.parse(data).map(reviveDates);
      report += `📚 Loaded ${existingMemory.length} existing translations\n\n`;
    } catch {
      report += `📚 No existing translation memory found\n\n`;
    }
    
    // Read all dialog files
    let dialogFiles: string[] = [];
    try {
      const files = await fs.readdir(dialogsDir);
      dialogFiles = files.filter(f => f.endsWith('.json'));
      report += `📁 Found ${dialogFiles.length} dialog files\n\n`;
    } catch {
      report += `📁 No dialog directory found\n\n`;
      return { content: [{ type: "text" as const, text: report }] };
    }
    
    // Process each dialog
    const newTranslations: Map<string, TranslationMemoryEntry> = new Map();
    let extractedCount = 0;
    let duplicateCount = 0;
    
    for (const file of dialogFiles) {
      try {
        const dialogPath = path.join(dialogsDir, file);
        const dialogData = JSON.parse(await fs.readFile(dialogPath, 'utf-8'));
        const dialog = reviveDates(dialogData) as DialogData;
        
        // Only process completed dialogs
        if (dialog.status !== 'completed') continue;
        
        const extracted = extractTranslationFromDialog(dialog);
        if (!extracted) continue;
        
        extractedCount++;
        
        // Create unique key for deduplication
        const key = `${extracted.sourceText}|${extracted.domain}|${extracted.context}`;
        
        if (newTranslations.has(key)) {
          duplicateCount++;
          // Keep the one with higher confidence
          const existing = newTranslations.get(key)!;
          if (extracted.confidence > existing.confidence) {
            newTranslations.set(key, {
              ...existing,
              targetText: extracted.targetText,
              confidence: extracted.confidence,
              lastUsed: new Date(dialog.lastUpdated)
            });
          }
        } else {
          newTranslations.set(key, {
            id: `tm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sourceText: extracted.sourceText,
            targetText: extracted.targetText,
            sourceLanguage,
            targetLanguage,
            context: extracted.context,
            domain: extracted.domain,
            confidence: extracted.confidence,
            usageCount: 1,
            lastUsed: new Date(dialog.lastUpdated),
            created: new Date(dialog.created)
          });
        }
      } catch (e) {
        console.error(`Error processing dialog ${file}:`, e);
      }
    }
    
    report += `## Extraction Results\n\n`;
    report += `- Extracted ${extractedCount} translations from dialogs\n`;
    report += `- Found ${duplicateCount} duplicates in dialogs\n`;
    report += `- Unique new translations: ${newTranslations.size}\n\n`;
    
    // Merge with existing memory
    const consolidatedMemory = new Map<string, TranslationMemoryEntry>();
    
    // Add existing entries
    for (const entry of existingMemory) {
      const key = `${entry.sourceText}|${entry.domain || 'general'}|${entry.context || ''}`;
      consolidatedMemory.set(key, entry);
    }
    
    // Merge new translations
    let mergedCount = 0;
    let updatedCount = 0;
    
    for (const [key, newEntry] of newTranslations) {
      if (consolidatedMemory.has(key)) {
        updatedCount++;
        const existing = consolidatedMemory.get(key)!;
        // Update if new translation has higher confidence
        if (newEntry.confidence > existing.confidence) {
          consolidatedMemory.set(key, {
            ...existing,
            targetText: newEntry.targetText,
            confidence: newEntry.confidence,
            lastUsed: newEntry.lastUsed,
            usageCount: existing.usageCount + 1
          });
        } else {
          // Just update usage count
          existing.usageCount++;
          existing.lastUsed = newEntry.lastUsed;
        }
      } else {
        mergedCount++;
        consolidatedMemory.set(key, newEntry);
      }
    }
    
    report += `## Consolidation Results\n\n`;
    report += `- Updated ${updatedCount} existing translations\n`;
    report += `- Added ${mergedCount} new translations\n`;
    report += `- Total translations: ${consolidatedMemory.size}\n\n`;
    
    if (!dryRun) {
      // Save consolidated memory
      const finalMemory = Array.from(consolidatedMemory.values());
      
      // Sort by usage and confidence
      finalMemory.sort((a, b) => {
        if (b.usageCount !== a.usageCount) {
          return b.usageCount - a.usageCount;
        }
        if (b.confidence !== a.confidence) {
          return b.confidence - a.confidence;
        }
        return b.lastUsed.getTime() - a.lastUsed.getTime();
      });
      
      await fs.writeFile(memoryFile, JSON.stringify(finalMemory, null, 2), 'utf-8');
      report += `✅ Saved consolidated memory to ${memoryFile}\n\n`;
      
      // Clean up dialogs if requested
      if (cleanupDialogs) {
        let cleanedCount = 0;
        for (const file of dialogFiles) {
          try {
            const dialogPath = path.join(dialogsDir, file);
            const dialogData = JSON.parse(await fs.readFile(dialogPath, 'utf-8'));
            if (dialogData.status === 'completed') {
              await fs.unlink(dialogPath);
              cleanedCount++;
            }
          } catch (e) {
            console.error(`Error cleaning up ${file}:`, e);
          }
        }
        report += `🗑️  Cleaned up ${cleanedCount} completed dialog files\n\n`;
      }
    } else {
      report += `⚠️  DRY RUN - No changes were made\n\n`;
    }
    
    // Show some statistics
    const finalMemory = Array.from(consolidatedMemory.values());
    const avgConfidence = finalMemory.reduce((sum, e) => sum + e.confidence, 0) / finalMemory.length;
    const totalUsage = finalMemory.reduce((sum, e) => sum + e.usageCount, 0);
    
    report += `## Statistics\n\n`;
    report += `- Average confidence: ${(avgConfidence * 100).toFixed(1)}%\n`;
    report += `- Total usage count: ${totalUsage}\n`;
    report += `- Most used translations:\n`;
    
    finalMemory
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5)
      .forEach(entry => {
        report += `  - "${entry.sourceText}" → "${entry.targetText}" (${entry.usageCount} uses)\n`;
      });
    
    return {
      content: [{
        type: "text" as const,
        text: report
      }]
    };
    
  } catch (error: unknown) {
    console.error('Error in consolidateTranslationMemory:', error);
    return {
      content: [{
        type: "text" as const,
        text: `Error during consolidation: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

export { ConsolidateTranslationMemoryInputSchema as consolidateTranslationMemorySchema }; 