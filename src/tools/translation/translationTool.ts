import { z } from 'zod';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Verbose logging flag (can be toggled from the agent side or via the 'verbose' parameter in tool input)
// To enable: setVerboseLogging(true) or pass { verbose: true } in the tool input if supported.
export let VERBOSE_LOGGING = false;
export function setVerboseLogging(value: boolean) {
  VERBOSE_LOGGING = value;
}
function vLog(...args: unknown[]) {
  if (VERBOSE_LOGGING) {
    console.error('[translationTool][VERBOSE]', ...args);
  }
}

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
  returnFormat: z.enum(['json', 'formatted']).default('json').describe('Return format: "json" for raw JSON response (default for agents), "formatted" for human-readable markdown'),
  // Optionally enable verbose logging for debugging
  verbose: z.boolean().optional().describe('Enable verbose logging for debugging (default: false)')
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
  vLog('Ensuring translation memory directory exists at', memoryDir);
  
  // Ensure directory exists
  try {
    await fs.access(memoryDir);
  } catch {
    await fs.mkdir(memoryDir, { recursive: true });
    vLog('Created translation memory directory:', memoryDir);
  }
  
  return memoryDir;
}

// Load translation memory for a language pair
async function loadTranslationMemory(sourceLanguage: string, targetLanguage: string): Promise<TranslationMemoryEntry[]> {
  const memoryDir = await getTranslationMemoryDir();
  const memoryFile = path.join(memoryDir, `${sourceLanguage}_to_${targetLanguage}.json`);
  vLog('Loading translation memory from', memoryFile);
  
  function reviveDates<T extends { created?: string | Date; lastUsed?: string | Date; lastUpdated?: string | Date }>(entry: T): T {
    if (entry && typeof entry === 'object') {
      if ('created' in entry && typeof entry.created === 'string') {
        entry.created = new Date(entry.created);
      }
      if ('lastUsed' in entry && typeof entry.lastUsed === 'string') {
        entry.lastUsed = new Date(entry.lastUsed);
      }
      if ('lastUpdated' in entry && typeof entry.lastUpdated === 'string') {
        entry.lastUpdated = new Date(entry.lastUpdated);
      }
    }
    return entry;
  }

  try {
    const data = await fs.readFile(memoryFile, 'utf-8');
    vLog('Loaded translation memory data:', data.length, 'bytes');
    return JSON.parse(data).map(reviveDates);
  } catch {
    vLog('Error loading translation memory');
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
  vLog('Saving translation memory to', memoryFile, 'with', memory.length, 'entries');
  
  // Sort by usage count and last used date for better retrieval
  memory.sort((a, b) => {
    if (b.usageCount !== a.usageCount) {
      return b.usageCount - a.usageCount;
    }
    return b.lastUsed.getTime() - a.lastUsed.getTime();
  });
  
  await fs.writeFile(memoryFile, JSON.stringify(memory, null, 2), 'utf-8');
  vLog('Saved translation memory to', memoryFile);
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
): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set.');
  }
  vLog('Calling OpenAI for translation. Prompt length:', prompt.length);
  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: isJsonResponse ? { type: "json_object" } : undefined,
      temperature: 0.3, // Lower temperature for more consistent translations
    });

    const rawContent = completion.choices[0]?.message?.content;
    vLog('OpenAI response received. Content length:', rawContent?.length || 0);

    if (typeof rawContent === 'string') {
      if (isJsonResponse) {
        try {
          return JSON.parse(rawContent);
        } catch {
          vLog('Failed to parse JSON response from OpenAI:', rawContent);
          throw new Error(`Failed to parse JSON response from OpenAI: ${rawContent}`);
        }
      }
      return rawContent;
    } else {
      vLog('No response received from OpenAI.');
      throw new Error('No response received from OpenAI.');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vLog('Error from OpenAI:', message);
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

// Helper function to generate clarification dialog markdown
function generateClarificationMarkdown(dialog: TranslationDialog, response: unknown): string {
  let md = `## Translation Dialog Started\n\n`;
  md += `**Dialog ID:** ${dialog.id}\n\n`;
  md += `The translator needs clarification:\n\n`;
  const clarificationQuestion = (typeof response === 'object' && response !== null && 'clarificationQuestion' in response && typeof (response as { clarificationQuestion: unknown }).clarificationQuestion === 'string')
    ? (response as { clarificationQuestion: string }).clarificationQuestion
    : '[no clarification question]';
  md += `**Question:** ${clarificationQuestion}\n\n`;
  const confidence = (typeof response === 'object' && response !== null && 'confidence' in response && typeof (response as { confidence: unknown }).confidence === 'number'
    ? (response as { confidence: number }).confidence
    : 0.9);
  let translation = '[no translation]';
  if (typeof response === 'object' && response !== null && 'translation' in response) {
    const t = (response as { translation?: unknown }).translation;
    if (typeof t === 'string') {
      translation = t;
    }
  }
  md += `**Current best translation:** "${translation}" (confidence: ${(confidence * 100).toFixed(0)}%)\n\n`;
  let alternatives: string[] = [];
  if (typeof response === 'object' && response !== null && 'alternatives' in response) {
    const alts = (response as { alternatives?: unknown }).alternatives;
    if (Array.isArray(alts) && alts.every(a => typeof a === 'string')) {
      alternatives = alts;
    }
  }
  if (alternatives.length > 0) {
    md += `**Alternative translations:**\n`;
    md += alternatives.map((alt: string) => `- "${alt}"`).join('\n') + '\n';
  }
  let explanation = '';
  if (typeof response === 'object' && response !== null && 'explanation' in response) {
    const exp = (response as { explanation?: unknown }).explanation;
    if (typeof exp === 'string' && exp) {
      explanation = exp;
    }
  }
  if (explanation) {
    md += `**Explanation:** ${explanation}\n`;
  }
  md += `\nTo continue this dialog, use the \`translate_content\` tool again with:\n- \`previousDialogId\`: "${dialog.id}"\n- \`context\`: (provide the answer to the clarification question)\n`;
  return md;
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
      previousDialogId,
      returnFormat,
      verbose
    } = params;

    // Set verbose logging if specified
    if (verbose !== undefined) {
      setVerboseLogging(verbose);
    }

    vLog('translateContent called with params:', JSON.stringify(params));

    // Load translation memory
    const memory = await loadTranslationMemory(sourceLanguage, targetLanguage);
    vLog('Loaded translation memory entries:', memory.length);
    
    // Find similar translations
    const similarTranslations = findSimilarTranslations(content, memory, context, domain);
    vLog('Found similar translations:', similarTranslations.length);
    
    // Check for exact match with high confidence
    if (similarTranslations.length > 0) {
      const exactMatch = similarTranslations.find(t => 
        t.sourceText === content &&
        t.confidence >= 0.95 &&
        t.domain === domain &&
        t.context === context
      );
      
      if (exactMatch) {
        vLog('Found exact match in translation memory, using cached translation');
        
        // Update usage count and last used
        const existingIndex = memory.findIndex(e => e.id === exactMatch.id);
        if (existingIndex >= 0) {
          memory[existingIndex].usageCount++;
          memory[existingIndex].lastUsed = new Date();
          await saveTranslationMemory(sourceLanguage, targetLanguage, memory);
        }
        
        // Return cached translation in requested format
        if (returnFormat === 'json') {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                translation: exactMatch.targetText,
                confidence: exactMatch.confidence,
                source: "cache",
                usageCount: exactMatch.usageCount + 1,
                domain: domain || 'general',
                context: context || null
              })
            }]
          };
        }
        
        return {
          content: [{
            type: "text" as const,
            text: `## Translation Result (from cache)

**Source (${sourceLanguage}):** "${content}"
**Target (${targetLanguage}):** "${exactMatch.targetText}"

**Confidence:** ${(exactMatch.confidence * 100).toFixed(0)}%
**Domain:** ${domain || 'general'}
**Context:** ${context || 'none'}
**Cache hits:** ${exactMatch.usageCount + 1} times
**Last used:** ${exactMatch.lastUsed.toISOString()}

### Translation Notes:
This translation was retrieved from cache. It has been used successfully ${exactMatch.usageCount + 1} times with high confidence.
`
          }]
        };
      }
    }
    
    // Load or create dialog
    let dialog = await loadDialog(previousDialogId);
    
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
      vLog('Created new dialog:', dialog.id);
    } else {
      vLog('Loaded existing dialog:', dialog.id);
    }
    
    // Generate learning notes
    const learningNotes = await generateLearningNotes(sourceLanguage, targetLanguage, domain);
    vLog('Generated learning notes length:', learningNotes.length);
    
    // Build prompt
    const prompt = `You are an expert translator specializing in context-aware, accurate translations. 

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
    vLog('OpenAI translation response:', JSON.stringify(response));
    
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
    if (
      typeof response === 'object' &&
      response !== null &&
      'clarificationNeeded' in response &&
      (response as { clarificationNeeded: boolean }).clarificationNeeded &&
      'clarificationQuestion' in response &&
      typeof (response as { clarificationQuestion: unknown }).clarificationQuestion === 'string'
    ) {
      dialog.status = 'active';
      await saveDialog(dialog);
      vLog('Dialog requires clarification:', (response as { clarificationQuestion: string }).clarificationQuestion);
      
      if (returnFormat === 'json') {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              dialogId: dialog.id,
              clarificationNeeded: true,
              clarificationQuestion: (response as { clarificationQuestion: string }).clarificationQuestion,
              currentTranslation: (typeof response === 'object' && response !== null && 'translation' in response && typeof (response as { translation?: unknown }).translation === 'string')
                ? (response as { translation: string }).translation
                : '',
              confidence: typeof response === 'object' && response !== null && 'confidence' in response && typeof (response as { confidence: unknown }).confidence === 'number' ? (response as { confidence: number }).confidence : 0.9,
              alternatives: typeof response === 'object' && response !== null && 'alternatives' in response ? (response as { alternatives: string[] }).alternatives || [] : [],
              explanation: typeof response === 'object' && response !== null && 'explanation' in response ? (response as { explanation: string }).explanation : ''
            })
          }]
        };
      }
      
      const clarificationMarkdown = generateClarificationMarkdown(dialog, response);
      return {
        content: [{
          type: "text" as const,
          text: clarificationMarkdown
        }]
      };
    }
    
    // Translation is complete
    dialog.status = 'completed';
    if (typeof response === 'object' && response !== null && 'translation' in response && typeof (response as { translation: unknown }).translation === 'string') {
      dialog.finalTranslation = (response as { translation: string }).translation;
    }
    await saveDialog(dialog);
    vLog('Dialog completed and saved:', dialog.id);
    
    // Add to translation memory
    const memoryEntry: TranslationMemoryEntry = {
      id: `tm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sourceText: content,
      targetText: typeof response === 'object' && response !== null && 'translation' in response && typeof (response as { translation: unknown }).translation === 'string' ? (response as { translation: string }).translation : '',
      sourceLanguage,
      targetLanguage,
      context,
      domain,
      confidence: typeof response === 'object' && response !== null && 'confidence' in response && typeof (response as { confidence: unknown }).confidence === 'number' ? (response as { confidence: number }).confidence : 0.9,
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
      if (
        typeof response === 'object' &&
        response !== null &&
        'confidence' in response &&
        typeof (response as { confidence: unknown }).confidence === 'number' &&
        (response as { confidence: number }).confidence > memory[existingIndex].confidence
      ) {
        memory[existingIndex].targetText = typeof response === 'object' && response !== null && 'translation' in response && typeof (response as { translation: unknown }).translation === 'string' ? (response as { translation: string }).translation : '';
        memory[existingIndex].confidence = (response as { confidence: number }).confidence;
      }
      vLog('Updated existing translation memory entry:', JSON.stringify(memory[existingIndex]));
    } else {
      // Add new entry
      memory.push(memoryEntry);
      vLog('Added new translation memory entry:', JSON.stringify(memoryEntry));
    }
    
    await saveTranslationMemory(sourceLanguage, targetLanguage, memory);
    vLog('Translation memory updated and saved.');
    
    // Return result in requested format
    if (returnFormat === 'json') {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            translation: typeof response === 'object' && response !== null && 'translation' in response && typeof (response as { translation: unknown }).translation === 'string' ? (response as { translation: string }).translation : '',
            confidence: typeof response === 'object' && response !== null && 'confidence' in response && typeof (response as { confidence: unknown }).confidence === 'number' ? (response as { confidence: number }).confidence : 0.9,
            alternatives: typeof response === 'object' && response !== null && 'alternatives' in response ? (response as { alternatives: string[] }).alternatives || [] : [],
            explanation: typeof response === 'object' && response !== null && 'explanation' in response ? (response as { explanation: string }).explanation : '',
            domain_notes: typeof response === 'object' && response !== null && 'domain_notes' in response ? (response as { domain_notes: string }).domain_notes : '',
            domain: domain || 'general',
            context: context || null,
            source: "new_translation"
          })
        }]
      };
    }
    
    // Return formatted result
    let markdown = `\n## Translation Result\n\n`;
    markdown += `**Source (${sourceLanguage}):** "${content}"\n`;
    markdown += `**Target (${targetLanguage}):** "${typeof response === 'object' && response !== null && 'translation' in response && typeof (response as { translation: unknown }).translation === 'string' ? (response as { translation: string }).translation : ''}"\n`;
    markdown += `\n**Confidence:** ${(typeof response === 'object' && response !== null && 'confidence' in response && typeof (response as { confidence: unknown }).confidence === 'number' ? (response as { confidence: number }).confidence : 0.9) * 100}%\n`;
    if (domain) markdown += `**Domain:** ${domain}\n`;
    if (context) markdown += `**Context:** ${context}\n`;
    markdown += `\n`;
    if (
      typeof response === 'object' &&
      response !== null &&
      'alternatives' in response &&
      Array.isArray((response as { alternatives: unknown }).alternatives) &&
      (response as { alternatives: unknown[] }).alternatives.length > 0
    ) {
      markdown += `### Alternative Translations:\n`;
      markdown += (response as { alternatives: string[] }).alternatives.map((alt: string) => `- "${alt}"`).join('\n') + '\n';
    }
    if (
      typeof response === 'object' &&
      response !== null &&
      'explanation' in response &&
      typeof (response as { explanation: unknown }).explanation === 'string' &&
      (response as { explanation: string }).explanation
    ) {
      markdown += `### Translation Notes:\n`;
      markdown += `${(response as { explanation: string }).explanation}\n`;
    }
    if (
      typeof response === 'object' &&
      response !== null &&
      'domain_notes' in response &&
      typeof (response as { domain_notes: unknown }).domain_notes === 'string' &&
      (response as { domain_notes: string }).domain_notes
    ) {
      markdown += `### Domain-Specific Notes:\n`;
      markdown += `${(response as { domain_notes: string }).domain_notes}\n`;
    }
    return {
      content: [{
        type: "text" as const,
        text: markdown
      }]
    };
    
  } catch (error: unknown) {
    vLog('Error in translateContent tool:', error instanceof Error ? error.message : String(error));
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