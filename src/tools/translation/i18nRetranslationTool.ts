import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { translateContent, setVerboseLogging } from './translationTool.js';

// Define the input schema
export const RetranslateI18nInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to the project root (e.g., /Users/co/dev/heygen/pacific)'),
  localesBasePath: z.string().describe('Base path to the locales directory (e.g., packages/movio/public/locales)'),
  sourceLocale: z.string().default('en-US').describe('The source locale for English files (e.g., en-US)'),
  namespace: z.string().describe('The namespace to retranslate (e.g., "Auth", "Home", "Welcome")'),
  targetLocales: z.array(z.string()).default(['pt-BR', 'ko-KR', 'es-MS']).describe('Target languages to translate to'),
  dryRun: z.boolean().default(false).describe('If true, shows what would be translated without making changes'),
  preserveExisting: z.boolean().default(true).describe('If true, only translates missing keys; if false, retranslates all keys'),
  domain: z.string().default('ui').describe('Translation domain context (e.g., "ui", "auth", "marketing")'),
  verbose: z.boolean().default(false).describe('Enable verbose logging for debugging')
});

// Terms that should never be translated
const DO_NOT_TRANSLATE = [
  'HeyGen', 'Apple', 'Google', 'Microsoft', 'Facebook', 'Twitter', 'LinkedIn',
  'SSO', 'OAuth', 'API', 'URL', 'ID', 'UUID', 'JSON', 'CSV', 'PDF',
  'GitHub', 'GitLab', 'Bitbucket', 'AWS', 'Azure', 'GCP'
];

// Replace protected terms with placeholders and restore them after translation
function protectTerms(value: string): { protectedText: string, placeholders: Record<string, string> } {
  let protectedText = value;
  const placeholders: Record<string, string> = {};
  
  DO_NOT_TRANSLATE.forEach((term, index) => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    const placeholder = `__PROTECTED_${index}__`;
    if (regex.test(protectedText)) {
      placeholders[placeholder] = term;
      protectedText = protectedText.replace(regex, placeholder);
    }
  });
  
  return { protectedText, placeholders };
}

function restoreTerms(translated: string, placeholders: Record<string, string>): string {
  let restored = translated;
  Object.entries(placeholders).forEach(([placeholder, term]) => {
    restored = restored.replace(new RegExp(placeholder, 'g'), term);
  });
  return restored;
}

// Language code mapping
const LANGUAGE_MAP: Record<string, string> = {
  'pt-BR': 'pt-BR',
  'ko-KR': 'ko',
  'es-MS': 'es'
};

// Get appropriate context based on namespace
function getContextForNamespace(namespace: string): string {
  const contexts: Record<string, string> = {
    'Auth': 'Authentication and login interface',
    'Home': 'Main dashboard and home screen',
    'Welcome': 'Onboarding and welcome screens',
    'Avatar': 'Avatar creation and management',
    'Editor': 'Video editing interface',
    'Settings': 'User settings and preferences',
    'Billing': 'Payment and subscription management',
    'Team': 'Team collaboration features'
  };
  
  return contexts[namespace] || 'User interface';
}

// Helper type guard for plain objects
function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Recursively translate all string values in an object
async function translateObject(
  obj: unknown,
  targetLanguage: string,
  domain: string,
  context: string,
  existingTranslations: unknown = {},
  preserveExisting: boolean = true,
  path: string[] = []
): Promise<unknown> {
  if (typeof obj === 'string') {
    // Check if we should preserve existing translation
    if (preserveExisting && existingTranslations && typeof existingTranslations === 'string' && existingTranslations.trim() !== '') {
      return existingTranslations;
    }
    
    // Check for interpolation variables
    const hasInterpolation = /\{\{.*?\}\}/.test(obj);
    
    // Protect terms that shouldn't be translated
    const { protectedText, placeholders } = protectTerms(obj);
    
    try {
      // Use our translation tool
      const result = await translateContent({
        content: protectedText,
        targetLanguage: LANGUAGE_MAP[targetLanguage] || targetLanguage,
        sourceLanguage: 'en',
        domain: domain,
        context: `${context}. Key path: ${path.join('.')}${hasInterpolation ? '. Contains interpolation variables that must be preserved.' : ''}`,
        requestClarification: false,
        returnFormat: 'formatted'
      });
      
      // Extract the translated text from the result
      const translatedText = result.content[0].text.match(/\*\*Target.*?\*\*\s*"(.+?)"/)?.[1] || obj;
      
      // Restore protected terms
      return restoreTerms(translatedText, placeholders);
    } catch (error) {
      console.error(`Translation error for "${obj}":`, error);
      return obj; // Return original on error
    }
  } else if (typeof obj === 'object' && obj !== null) {
    if (Array.isArray(obj)) {
      // Handle arrays
      return await Promise.all(
        obj.map((item, idx) => {
          const existing = Array.isArray(existingTranslations) ? existingTranslations[idx] : undefined;
          return translateObject(item, targetLanguage, domain, context, existing, preserveExisting, [...path, String(idx)]);
        })
      );
    } else {
      // Handle objects
      const result: Record<string, unknown> = {};
      if (isPlainObject(obj)) {
        const objEntries = Object.entries(obj as { [key: string]: unknown });
        for (const [key, value] of objEntries) {
          const existing = (typeof existingTranslations === 'object' && existingTranslations !== null && !Array.isArray(existingTranslations))
            ? (existingTranslations as Record<string, unknown>)[key]
            : undefined;
          result[key] = await translateObject(value, targetLanguage, domain, context, existing, preserveExisting, [...path, key]);
        }
      }
      return result;
    }
  }
  return obj;
}

// Main retranslation function
export async function retranslateI18n(params: z.infer<typeof RetranslateI18nInputSchema>): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    const { projectPath, localesBasePath, sourceLocale, namespace, targetLocales, dryRun, preserveExisting, domain, verbose } = params;
    setVerboseLogging(verbose);
    
    // Construct paths
    const localesPath = path.isAbsolute(localesBasePath) ? localesBasePath : path.join(projectPath, localesBasePath);
    const englishFilePath = path.join(localesPath, sourceLocale, `${namespace}.json`);
    
    // Check if English file exists
    try {
      await fs.access(englishFilePath);
    } catch {
      return {
        content: [{
          type: "text" as const,
          text: `❌ Error: English source file not found at ${englishFilePath}. Please provide the correct localesBasePath and sourceLocale.`
        }]
      };
    }
    
    // Read English source file
    const englishContent = await fs.readFile(englishFilePath, 'utf-8');
    const englishJson = JSON.parse(englishContent);
    
    // Count total keys
    const countKeys = (obj: unknown): number => {
      if (typeof obj === 'string') return 1;
      if (Array.isArray(obj)) return obj.reduce<number>((sum, item) => sum + countKeys(item), 0);
      if (isPlainObject(obj)) {
        return Object.values(obj).reduce<number>((sum, value) => sum + countKeys(value), 0);
      }
      return 0;
    };
    
    const totalKeys = countKeys(englishJson);
    const context = getContextForNamespace(namespace);
    
    let report = `# i18n Retranslation Report\n\n`;
    report += `**Namespace:** ${namespace}\n`;
    report += `**Source:** ${englishFilePath}\n`;
    report += `**Total Keys:** ${totalKeys}\n`;
    report += `**Target Languages:** ${targetLocales.join(', ')}\n`;
    report += `**Mode:** ${dryRun ? 'DRY RUN' : 'LIVE'}\n`;
    report += `**Preserve Existing:** ${preserveExisting ? 'Yes' : 'No'}\n`;
    report += `**Domain:** ${domain}\n`;
    report += `**Context:** ${context}\n\n`;
    
    // Process each target language
    for (const targetLang of targetLocales) {
      report += `## ${targetLang}\n\n`;
      
      const targetFilePath = path.join(localesPath, targetLang, `${namespace}.json`);
      
      // Check if target directory exists
      const targetDir = path.dirname(targetFilePath);
      try {
        await fs.access(targetDir);
      } catch {
        if (!dryRun) {
          await fs.mkdir(targetDir, { recursive: true });
          report += `✅ Created directory: ${targetDir}\n`;
        } else {
          report += `📁 Would create directory: ${targetDir}\n`;
        }
      }
      
      // Load existing translations if they exist
      let existingTranslations = {};
      try {
        const existingContent = await fs.readFile(targetFilePath, 'utf-8');
        existingTranslations = JSON.parse(existingContent);
        report += `📄 Found existing file with ${countKeys(existingTranslations)} keys\n`;
      } catch {
        report += `📄 No existing file found\n`;
      }
      
      if (dryRun) {
        // In dry run, just analyze what would be translated
        const wouldTranslate = countKeys(englishJson) - (preserveExisting ? countKeys(existingTranslations) : 0);
        report += `�� Would translate ${wouldTranslate} keys\n\n`;
        
        // Show sample translations
        report += `### Sample Translations:\n`;
        const samples = isPlainObject(englishJson) ? Object.entries(englishJson).slice(0, 3) : [];
        for (const [key, value] of samples) {
          if (typeof value === 'string') {
            let existing: string | undefined = undefined;
            if (isPlainObject(existingTranslations)) {
              const v = existingTranslations[key];
              if (typeof v === 'string') existing = v;
            }
            if (!preserveExisting || !existing) {
              report += `- **${key}**: "${value}" → (would translate)\n`;
            } else {
              report += `- **${key}**: "${value}" → "${existing}" (preserved)\n`;
            }
          }
        }
        report += '\n';
      } else {
        // Perform actual translation
        report += `🔄 Translating...\n`;
        
        try {
          const translatedJson = await translateObject(
            englishJson,
            targetLang,
            domain,
            context,
            existingTranslations,
            preserveExisting
          );
          
          // Write the translated file
          await fs.writeFile(
            targetFilePath,
            JSON.stringify(translatedJson, null, 2) + '\n',
            'utf-8'
          );
          
          report += `✅ Successfully wrote ${targetFilePath}\n`;
          report += `📊 Translated ${countKeys(translatedJson)} keys\n\n`;
          
          // Show some examples
          report += `### Sample Results:\n`;
          let sampleEntries: [string, unknown][] = [];
          if (isPlainObject(translatedJson)) {
            sampleEntries = Object.entries(translatedJson).slice(0, 3);
          }
          for (const [key, value] of sampleEntries) {
            if (typeof value === 'string') {
              let original: string | undefined = undefined;
              if (isPlainObject(englishJson)) {
                const v = englishJson[key];
                if (typeof v === 'string') original = v;
              }
              report += `- **${key}**: "${original ?? ''}" → "${value}"\n`;
            }
          }
          report += '\n';
        } catch (error) {
          report += `❌ Error translating: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`;
        }
      }
    }
    
    // Add tips
    report += `## Tips\n\n`;
    report += `- Protected terms (${DO_NOT_TRANSLATE.slice(0, 5).join(', ')}, etc.) are preserved\n`;
    report += `- Interpolation variables ({{name}}) are maintained\n`;
    report += `- Translation memory improves consistency over time\n`;
    report += `- Review translations for accuracy, especially for domain-specific terms\n`;
    
    return {
      content: [{
        type: "text" as const,
        text: report
      }]
    };
    
  } catch (error: unknown) {
    console.error('Error in retranslateI18n tool:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return {
      content: [
        { type: "text" as const, text: `Error during i18n retranslation: ${errorMessage}` },
      ],
    };
  }
}

// Export schema for registration
export { RetranslateI18nInputSchema as retranslateI18nSchema }; 