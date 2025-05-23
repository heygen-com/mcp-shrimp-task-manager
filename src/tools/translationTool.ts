import { z } from 'zod';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Define the input schema for the translation tool
export const TranslateContentInputSchema = z.object({
  content: z.string().describe('The content to translate (can be a single term or multiple strings)'),
  targetLanguage: z.string().describe('Target language code (e.g., "zh-TW", "es", "fr", "ja")'),
  sourceLanguage: z.string().default('en').describe('Source language code (default: "en")'),
  context: z.string().optional().describe('Context about where/how this content is used (e.g., "educational credits in a student portal", "financial credits in banking app")'),
  taskId: z.string().uuid().optional().describe('Optional task ID if this translation is related to a specific task'),
  domain: z.string().optional().describe('Domain/category for this translation (e.g., "education", "finance", "ui", "error_messages")'),
  requestClarification: z.boolean().default(false).describe('Whether the secondary agent should request clarification if context is ambiguous'),
  previousDialogId: z.string().optional().describe('ID of previous dialog to continue conversation'),
});

// Dialog turn structure
interface DialogTurn {
  role: 'primary' | 'secondary';
  content: string;
  timestamp: Date;
}

// Translation memory entry structure
interface TranslationMemoryEntry {
  id: string;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: string;
  domain?: string;
  confidence: number; // 0-1 score
  usageCount: number;
  lastUsed: Date;
  created: Date;
  dialog?: DialogTurn[];
}

// Translation dialog structure
interface TranslationDialog {
  id: string;
  turns: DialogTurn[];
  sourceContent: string;
  targetLanguage: string;
  status: 'active' | 'completed' | 'abandoned';
  finalTranslation?: string;
  created: Date;
  lastUpdated: Date;
}

// Get translation memory directory
async function getTranslationMemoryDir(): Promise<string> {
  const dataDir = process.env.DATA_DIR || path.join(PROJECT_ROOT, "data");
  const memoryDir = path.join(dataDir, 'translation_memory');
  
  // Ensure directory exists
  try {
    await fs.access(memoryDir);
  } catch {
    await fs.mkdir(memoryDir, { recursive: true });
  }
  
  return memoryDir;
}

// Load translation memory for a language pair
async function loadTranslationMemory(sourceLanguage: string, targetLanguage: string): Promise<TranslationMemoryEntry[]> {
  const memoryDir = await getTranslationMemoryDir();
  const memoryFile = path.join(memoryDir, `${sourceLanguage}_to_${targetLanguage}.json`);
  
  try {
    const data = await fs.readFile(memoryFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Return empty array if file doesn't exist
    return [];
  }
}

// Save translation memory
async function saveTranslationMemory(
  sourceLanguage: string, 
  targetLanguage: string, 
  memory: TranslationMemoryEntry[]
): Promise<void> {
  const memoryDir = await getTranslationMemoryDir();
  const memoryFile = path.join(memoryDir, `${sourceLanguage}_to_${targetLanguage}.json`);
  
  // Sort by usage count and last used date for better retrieval
  memory.sort((a, b) => {
    if (b.usageCount !== a.usageCount) {
      return b.usageCount - a.usageCount;
    }
    return b.lastUsed.getTime() - a.lastUsed.getTime();
  });
  
  await fs.writeFile(memoryFile, JSON.stringify(memory, null, 2), 'utf-8');
}

// Find similar translations in memory
function findSimilarTranslations(
  query: string,
  memory: TranslationMemoryEntry[],
  context?: string,
  domain?: string,
  limit: number = 5
): TranslationMemoryEntry[] {
  // Simple exact match first
  const exactMatches = memory.filter(entry => 
    entry.sourceText.toLowerCase() === query.toLowerCase()
  );
  
  // Filter by domain if specified
  let relevantEntries = domain 
    ? exactMatches.filter(e => e.domain === domain)
    : exactMatches;
  
  // If no domain matches, include all exact matches
  if (relevantEntries.length === 0 && domain) {
    relevantEntries = exactMatches;
  }
  
  // Sort by confidence and usage
  relevantEntries.sort((a, b) => {
    // Prioritize domain matches
    if (domain && a.domain === domain && b.domain !== domain) return -1;
    if (domain && b.domain === domain && a.domain !== domain) return 1;
    
    // Then by confidence
    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }
    
    // Then by usage count
    return b.usageCount - a.usageCount;
  });
  
  return relevantEntries.slice(0, limit);
}

// Call OpenAI for translation
async function callOpenAIForTranslation(
  prompt: string,
  isJsonResponse: boolean = true
): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set.');
  }

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: isJsonResponse ? { type: "json_object" } : undefined,
      temperature: 0.3, // Lower temperature for more consistent translations
    });

    const rawContent = completion.choices[0]?.message?.content;

    if (rawContent) {
      if (isJsonResponse) {
        try {
          return JSON.parse(rawContent);
        } catch (e) {
          throw new Error(`Failed to parse JSON response from OpenAI: ${rawContent}`);
        }
      }
      return rawContent;
    } else {
      throw new Error('No response received from OpenAI.');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get translation from OpenAI: ${message}`);
  }
}

// Load or create dialog
async function loadDialog(dialogId?: string): Promise<TranslationDialog | null> {
  if (!dialogId) return null;
  
  const memoryDir = await getTranslationMemoryDir();
  const dialogFile = path.join(memoryDir, 'dialogs', `${dialogId}.json`);
  
  try {
    const data = await fs.readFile(dialogFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Save dialog
async function saveDialog(dialog: TranslationDialog): Promise<void> {
  const memoryDir = await getTranslationMemoryDir();
  const dialogDir = path.join(memoryDir, 'dialogs');
  
  // Ensure dialog directory exists
  try {
    await fs.access(dialogDir);
  } catch {
    await fs.mkdir(dialogDir, { recursive: true });
  }
  
  const dialogFile = path.join(dialogDir, `${dialog.id}.json`);
  await fs.writeFile(dialogFile, JSON.stringify(dialog, null, 2), 'utf-8');
}

// Generate learning notes from translation memory
async function generateLearningNotes(
  sourceLanguage: string,
  targetLanguage: string,
  domain?: string
): Promise<string> {
  const memory = await loadTranslationMemory(sourceLanguage, targetLanguage);
  
  // Filter by domain if specified
  const relevantMemory = domain 
    ? memory.filter(e => e.domain === domain)
    : memory;
  
  if (relevantMemory.length === 0) {
    return '';
  }
  
  // Group by domain
  const byDomain: Record<string, TranslationMemoryEntry[]> = {};
  relevantMemory.forEach(entry => {
    const d = entry.domain || 'general';
    if (!byDomain[d]) byDomain[d] = [];
    byDomain[d].push(entry);
  });
  
  let notes = `# Translation Patterns (${sourceLanguage} → ${targetLanguage})\n\n`;
  
  for (const [d, entries] of Object.entries(byDomain)) {
    notes += `## Domain: ${d}\n\n`;
    
    // Show top patterns
    const topEntries = entries
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);
    
    topEntries.forEach(entry => {
      notes += `- **"${entry.sourceText}"** → **"${entry.targetText}"**\n`;
      if (entry.context) {
        notes += `  - Context: ${entry.context}\n`;
      }
      notes += `  - Used ${entry.usageCount} times (confidence: ${(entry.confidence * 100).toFixed(0)}%)\n`;
    });
    
    notes += '\n';
  }
  
  return notes;
}

// Main translation function
export async function translateContent(params: z.infer<typeof TranslateContentInputSchema>): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    const { 
      content, 
      targetLanguage, 
      sourceLanguage, 
      context, 
      domain, 
      requestClarification,
      previousDialogId 
    } = params;

    // Load translation memory
    const memory = await loadTranslationMemory(sourceLanguage, targetLanguage);
    
    // Find similar translations
    const similarTranslations = findSimilarTranslations(content, memory, context, domain);
    
    // Load or create dialog
    let dialog = await loadDialog(previousDialogId);
    const isNewDialog = !dialog;
    
    if (!dialog) {
      dialog = {
        id: `dialog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        turns: [],
        sourceContent: content,
        targetLanguage,
        status: 'active',
        created: new Date(),
        lastUpdated: new Date()
      };
    }
    
    // Generate learning notes
    const learningNotes = await generateLearningNotes(sourceLanguage, targetLanguage, domain);
    
    // Build prompt
    let prompt = `You are an expert translator specializing in context-aware, accurate translations. 

Source Language: ${sourceLanguage}
Target Language: ${targetLanguage}
Content to Translate: "${content}"
${context ? `Context: ${context}` : ''}
${domain ? `Domain: ${domain}` : ''}

${similarTranslations.length > 0 ? `
## Previous Similar Translations:
${similarTranslations.map(t => 
  `- "${t.sourceText}" → "${t.targetText}" (${t.domain || 'general'}, confidence: ${(t.confidence * 100).toFixed(0)}%)`
).join('\n')}
` : ''}

${learningNotes ? `
## Translation Patterns:
${learningNotes}
` : ''}

${dialog.turns.length > 0 ? `
## Previous Dialog:
${dialog.turns.map(turn => 
  `${turn.role === 'primary' ? 'Primary Agent' : 'Translator'}: ${turn.content}`
).join('\n')}
` : ''}

Instructions:
1. Provide an accurate, context-aware translation
2. Consider the domain and context provided
3. Learn from previous similar translations
4. ${requestClarification ? 'If the context is ambiguous or you need clarification, ask a specific question' : 'Provide the best translation based on available context'}
5. Rate your confidence (0-1) in this translation
6. If there are multiple valid translations, explain the differences

Respond in JSON format:
{
  "translation": "the translated content",
  "confidence": 0.95,
  "alternatives": ["alternative translation 1", "alternative translation 2"],
  "clarificationNeeded": ${requestClarification},
  "clarificationQuestion": "specific question if needed",
  "explanation": "brief explanation of translation choices",
  "domain_notes": "any domain-specific considerations"
}`;

    // Get translation from OpenAI
    const response = await callOpenAIForTranslation(prompt);
    
    // Add to dialog
    dialog.turns.push({
      role: 'primary',
      content: `Translate: "${content}" (${context || 'no specific context'})`,
      timestamp: new Date()
    });
    
    dialog.turns.push({
      role: 'secondary',
      content: JSON.stringify(response),
      timestamp: new Date()
    });
    
    dialog.lastUpdated = new Date();
    
    // If clarification is needed, save dialog and return question
    if (response.clarificationNeeded && response.clarificationQuestion) {
      dialog.status = 'active';
      await saveDialog(dialog);
      
      return {
        content: [{
          type: "text" as const,
          text: `## Translation Dialog Started

**Dialog ID:** ${dialog.id}

The translator needs clarification:

**Question:** ${response.clarificationQuestion}

**Current best translation:** "${response.translation}" (confidence: ${(response.confidence * 100).toFixed(0)}%)

${response.alternatives?.length > 0 ? `
**Alternative translations:**
${response.alternatives.map((alt: string) => `- "${alt}"`).join('\n')}
` : ''}

${response.explanation ? `
**Explanation:** ${response.explanation}
` : ''}

To continue this dialog, use the \`translate_content\` tool again with:
- \`previousDialogId\`: "${dialog.id}"
- \`context\`: (provide the answer to the clarification question)
`
        }]
      };
    }
    
    // Translation is complete
    dialog.status = 'completed';
    dialog.finalTranslation = response.translation;
    await saveDialog(dialog);
    
    // Add to translation memory
    const memoryEntry: TranslationMemoryEntry = {
      id: `tm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sourceText: content,
      targetText: response.translation,
      sourceLanguage,
      targetLanguage,
      context,
      domain,
      confidence: response.confidence || 0.9,
      usageCount: 1,
      lastUsed: new Date(),
      created: new Date(),
      dialog: dialog.turns
    };
    
    // Update or add to memory
    const existingIndex = memory.findIndex(e => 
      e.sourceText.toLowerCase() === content.toLowerCase() &&
      e.domain === domain
    );
    
    if (existingIndex >= 0) {
      // Update existing entry
      memory[existingIndex].usageCount++;
      memory[existingIndex].lastUsed = new Date();
      if (response.confidence > memory[existingIndex].confidence) {
        memory[existingIndex].targetText = response.translation;
        memory[existingIndex].confidence = response.confidence;
      }
    } else {
      // Add new entry
      memory.push(memoryEntry);
    }
    
    await saveTranslationMemory(sourceLanguage, targetLanguage, memory);
    
    // Return result
    return {
      content: [{
        type: "text" as const,
        text: `## Translation Result

**Source (${sourceLanguage}):** "${content}"
**Target (${targetLanguage}):** "${response.translation}"

**Confidence:** ${(response.confidence * 100).toFixed(0)}%
${domain ? `**Domain:** ${domain}` : ''}
${context ? `**Context:** ${context}` : ''}

${response.alternatives?.length > 0 ? `
### Alternative Translations:
${response.alternatives.map((alt: string) => `- "${alt}"`).join('\n')}
` : ''}

${response.explanation ? `
### Translation Notes:
${response.explanation}
` : ''}

${response.domain_notes ? `
### Domain-Specific Notes:
${response.domain_notes}
` : ''}

${similarTranslations.length > 0 ? `
### Translation Memory:
This translation has been saved to memory. Similar translations found:
${similarTranslations.slice(0, 3).map(t => 
  `- "${t.sourceText}" → "${t.targetText}" (used ${t.usageCount} times)`
).join('\n')}
` : `
### Translation Memory:
This is a new translation that has been saved to memory for future reference.
`}
`
      }]
    };
    
  } catch (error: unknown) {
    console.error('Error in translateContent tool:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during translation.';
    return {
      content: [
        { type: "text" as const, text: `Error during translation: ${errorMessage}` },
      ],
    };
  }
}

// Export schema for registration
export { TranslateContentInputSchema as translateContentSchema }; 