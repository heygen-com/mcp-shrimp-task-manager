import { MemoryType } from '../../types/memory.js';
import { recordMemory } from '../memoryTool.js';
import { Task } from '../../types/index.js';

interface TriggerContext {
  taskId?: string;
  projectId?: string;
  files?: string[];
  recentActions?: string[];
}

interface TriggerResult {
  shouldTrigger: boolean;
  type: MemoryType;
  confidence: number;
  summary: string;
  content: string;
  tags: string[];
}

// Keywords and patterns for different memory types
const TRIGGER_PATTERNS = {
  breakthrough: {
    keywords: ['solved', 'fixed', 'discovered', 'realized', 'breakthrough', 'aha', 'figured out', 'found the issue', 'finally'],
    minConfidence: 0.7
  },
  decision: {
    keywords: ['decided', 'chose', 'will use', 'going with', 'selected', 'opted for', 'determined'],
    minConfidence: 0.6
  },
  feedback: {
    keywords: ['good work', 'great job', 'thanks', 'excellent', 'perfect', 'well done', 'awesome', 'appreciate'],
    minConfidence: 0.8
  },
  error_recovery: {
    keywords: ['resolved error', 'fixed bug', 'error was', 'issue was', 'problem solved', 'debugging'],
    minConfidence: 0.7
  },
  pattern: {
    keywords: ['pattern', 'recurring', 'again', 'similar to', 'like before', 'same issue', 'keeps happening'],
    minConfidence: 0.6
  },
  user_preference: {
    keywords: ['prefer', 'like this', 'always', 'usually', 'my style', 'i want', 'please always'],
    minConfidence: 0.6
  }
};

// Analyze text for trigger patterns
export function analyzeTrigger(text: string): TriggerResult | null {
  const lowerText = text.toLowerCase();
  
  for (const [type, config] of Object.entries(TRIGGER_PATTERNS)) {
    const matchCount = config.keywords.filter(keyword => lowerText.includes(keyword)).length;
    
    if (matchCount > 0) {
      const confidence = Math.min(0.95, config.minConfidence + (matchCount * 0.1));
      
      // Generate summary based on type
      const summary = generateSummary(type as MemoryType, text);
      
      return {
        shouldTrigger: confidence >= config.minConfidence,
        type: type as MemoryType,
        confidence,
        summary,
        content: text,
        tags: extractTags(text, type as MemoryType)
      };
    }
  }
  
  return null;
}

// Generate a concise summary based on memory type
function generateSummary(type: MemoryType, content: string): string {
  const firstLine = content.split('\n')[0];
  const maxLength = 100;
  
  switch (type) {
    case MemoryType.BREAKTHROUGH:
      return `Breakthrough: ${firstLine.substring(0, maxLength)}`;
    case MemoryType.DECISION:
      return `Decision made: ${firstLine.substring(0, maxLength)}`;
    case MemoryType.FEEDBACK:
      return `Positive feedback received`;
    case MemoryType.ERROR_RECOVERY:
      return `Error resolved: ${firstLine.substring(0, maxLength)}`;
    case MemoryType.PATTERN:
      return `Pattern identified: ${firstLine.substring(0, maxLength)}`;
    case MemoryType.USER_PREFERENCE:
      return `User preference noted`;
    default:
      return firstLine.substring(0, maxLength);
  }
}

// Extract relevant tags from content
function extractTags(content: string, type: MemoryType): string[] {
  const tags: string[] = [type];
  
  // Extract file extensions
  const fileMatches = content.match(/\.[a-zA-Z]+/g);
  if (fileMatches) {
    fileMatches.forEach(ext => {
      if (ext.length < 10) tags.push(ext.substring(1));
    });
  }
  
  // Add specific tags based on content
  if (content.includes('test')) tags.push('testing');
  if (content.includes('bug') || content.includes('error')) tags.push('debugging');
  if (content.includes('performance')) tags.push('performance');
  if (content.includes('security')) tags.push('security');
  if (content.includes('api')) tags.push('api');
  if (content.includes('database')) tags.push('database');
  
  return [...new Set(tags)]; // Remove duplicates
}

// Hook for task completion
export async function onTaskComplete(task: Task, completionNotes?: string): Promise<void> {
  if (!completionNotes) return;
  
  const trigger = analyzeTrigger(completionNotes);
  
  if (trigger && trigger.shouldTrigger) {
    await recordMemory({
      content: trigger.content,
      summary: trigger.summary,
      type: trigger.type,
      confidence: trigger.confidence,
      tags: [...trigger.tags, 'task-completion'],
      projectId: task.projectId,
      taskId: task.id,
      contextSnapshot: {
        taskContext: {
          taskId: task.id,
          taskName: task.name,
          taskStatus: 'completed'
        }
      },
      metadata: {}
    });
  }
}

// Hook for task verification
export async function onTaskVerify(task: Task, verificationNotes?: string): Promise<void> {
  if (!verificationNotes) return;
  
  const trigger = analyzeTrigger(verificationNotes);
  
  if (trigger && trigger.shouldTrigger) {
    await recordMemory({
      content: trigger.content,
      summary: trigger.summary,
      type: trigger.type,
      confidence: trigger.confidence,
      tags: [...trigger.tags, 'task-verification'],
      projectId: task.projectId,
      taskId: task.id,
      contextSnapshot: {
        taskContext: {
          taskId: task.id,
          taskName: task.name,
          taskStatus: 'verified'
        }
      },
      metadata: {}
    });
  }
}

// Hook for user interactions
export async function onUserFeedback(feedback: string, context?: TriggerContext): Promise<void> {
  const trigger = analyzeTrigger(feedback);
  
  if (trigger && trigger.shouldTrigger && trigger.type === MemoryType.FEEDBACK) {
    await recordMemory({
      content: trigger.content,
      summary: trigger.summary,
      type: trigger.type,
      confidence: trigger.confidence,
      tags: [...trigger.tags, 'user-feedback'],
      projectId: context?.projectId,
      taskId: context?.taskId,
      contextSnapshot: {
        files: context?.files,
        recentActions: context?.recentActions
      },
      metadata: {}
    });
  }
}

// Hook for error recovery
export async function onErrorRecovery(
  errorDescription: string,
  solution: string,
  context?: TriggerContext
): Promise<void> {
  const content = `Error: ${errorDescription}\n\nSolution: ${solution}`;
  
  await recordMemory({
    content,
    summary: `Error resolved: ${errorDescription.substring(0, 50)}...`,
    type: MemoryType.ERROR_RECOVERY,
    confidence: 0.9,
    tags: ['error-recovery', 'debugging'],
    projectId: context?.projectId,
    taskId: context?.taskId,
    contextSnapshot: {
      files: context?.files,
      recentActions: context?.recentActions
    },
    metadata: {}
  });
}

// Generic hook for any text that might contain memory-worthy content
export async function analyzeTextForMemory(
  text: string,
  context?: TriggerContext
): Promise<TriggerResult | null> {
  const trigger = analyzeTrigger(text);
  
  if (trigger && trigger.shouldTrigger) {
    await recordMemory({
      content: trigger.content,
      summary: trigger.summary,
      type: trigger.type,
      confidence: trigger.confidence,
      tags: trigger.tags,
      projectId: context?.projectId,
      taskId: context?.taskId,
      contextSnapshot: {
        files: context?.files,
        recentActions: context?.recentActions
      },
      metadata: {}
    });
    
    return trigger;
  }
  
  return null;
} 