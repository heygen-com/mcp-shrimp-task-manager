import { Memory, MemoryType, MemoryQuery } from '../types/memory.js';
import crypto from 'crypto';

// Generate a fingerprint for memory content
export function generateMemoryFingerprint(content: string, type: MemoryType): string {
  const normalized = content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
  
  return crypto.createHash('sha256')
    .update(`${type}:${normalized}`)
    .digest('hex');
}

// Calculate similarity between two texts using Jaccard similarity
export function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

// Enhanced similarity with TF-IDF-like weighting
export function calculateWeightedSimilarity(text1: string, text2: string): number {
  const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'as', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall']);
  
  const getSignificantWords = (text: string) => {
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  };
  
  const words1 = getSignificantWords(text1);
  const words2 = getSignificantWords(text2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const freq1 = words1.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const freq2 = words2.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Calculate cosine similarity
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  const allWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);
  
  for (const word of allWords) {
    const f1 = freq1[word] || 0;
    const f2 = freq2[word] || 0;
    dotProduct += f1 * f2;
    norm1 += f1 * f1;
    norm2 += f2 * f2;
  }
  
  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator > 0 ? dotProduct / denominator : 0;
}

// Find potential memory chains
export function findMemoryChains(memories: Memory[], maxChainDistance: number = 3): Map<string, string[]> {
  const chains = new Map<string, string[]>();
  
  // Sort memories by creation date
  const sortedMemories = [...memories].sort((a, b) => 
    a.created.getTime() - b.created.getTime()
  );
  
  for (let i = 0; i < sortedMemories.length; i++) {
    const memory = sortedMemories[i];
    const chain: string[] = [memory.id];
    
    // Look for related memories within the distance
    for (let j = i + 1; j < Math.min(i + maxChainDistance + 1, sortedMemories.length); j++) {
      const candidate = sortedMemories[j];
      
      // Check if they share tags or have similar content
      const sharedTags = memory.tags.filter(tag => candidate.tags.includes(tag));
      const contentSimilarity = calculateTextSimilarity(memory.content, candidate.content);
      
      if (sharedTags.length > 0 || contentSimilarity > 0.3) {
        chain.push(candidate.id);
      }
    }
    
    if (chain.length > 1) {
      chains.set(memory.id, chain);
    }
  }
  
  return chains;
}

// Extract entities from memory content
export function extractEntities(content: string): string[] {
  const entities: string[] = [];
  
  // Extract file paths
  const filePathRegex = /(?:\/|\\|\b)[\w\-./\\]+\.(ts|js|tsx|jsx|json|md|css|scss|html|py|go|rs|java|cpp|c|h)/gi;
  const filePaths = content.match(filePathRegex) || [];
  entities.push(...filePaths);
  
  // Extract function/class names (camelCase or PascalCase)
  const codeNameRegex = /\b[A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)*\b|\b[a-z]+(?:[A-Z][a-zA-Z0-9]*)+\b/g;
  const codeNames = content.match(codeNameRegex) || [];
  entities.push(...codeNames.filter(name => name.length > 3));
  
  // Extract package names (e.g., @scope/package or package-name)
  const packageRegex = /@?[\w-]+\/[\w-]+|[\w-]+-[\w-]+/g;
  const packages = content.match(packageRegex) || [];
  entities.push(...packages);
  
  // Extract URLs
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = content.match(urlRegex) || [];
  entities.push(...urls);
  
  // Remove duplicates and return
  return [...new Set(entities)];
}

// Calculate context relevance score
export function calculateContextRelevance(
  memory: Memory,
  context: NonNullable<MemoryQuery['context']>
): number {
  let score = 0;
  
  // Task match (highest weight)
  if (context.currentTask && memory.taskId === context.currentTask) {
    score += 0.4;
  }
  
  // File overlap
  if (context.currentFiles && memory.contextSnapshot.files) {
    const memoryFiles = new Set(memory.contextSnapshot.files);
    const overlap = context.currentFiles.filter(file => memoryFiles.has(file)).length;
    if (context.currentFiles.length > 0) {
      score += (overlap / context.currentFiles.length) * 0.3;
    }
  }
  
  // Recent action similarity
  if (context.recentActions && memory.contextSnapshot.recentActions) {
    const similarity = calculateTextSimilarity(
      context.recentActions.join(' '),
      memory.contextSnapshot.recentActions.join(' ')
    );
    score += similarity * 0.2;
  }
  
  // Entity overlap
  if (memory.entities && context.currentFiles) {
    const memoryEntities = new Set(memory.entities);
    const contextEntities = new Set(context.currentFiles.flatMap(f => extractEntities(f)));
    const entityOverlap = [...contextEntities].filter(e => memoryEntities.has(e)).length;
    if (contextEntities.size > 0) {
      score += (entityOverlap / contextEntities.size) * 0.1;
    }
  }
  
  return Math.min(1, score);
}

// Consolidate similar memories
export function consolidateMemories(
  memories: Memory[],
  similarityThreshold: number = 0.85
): { consolidated: Memory[]; mergeMap: Map<string, string[]> } {
  const consolidated: Memory[] = [];
  const mergeMap = new Map<string, string[]>();
  const processed = new Set<string>();
  
  for (const memory of memories) {
    if (processed.has(memory.id)) continue;
    
    const similar: Memory[] = [];
    
    for (const candidate of memories) {
      if (candidate.id === memory.id || processed.has(candidate.id)) continue;
      
      // Check if they're the same type and have high content similarity
      if (
        memory.type === candidate.type &&
        calculateWeightedSimilarity(memory.content, candidate.content) >= similarityThreshold
      ) {
        similar.push(candidate);
        processed.add(candidate.id);
      }
    }
    
    if (similar.length > 0) {
      // Create a consolidated memory
      const allMemories = [memory, ...similar];
      const consolidatedMemory: Memory = {
        ...memory,
        content: memory.content, // Keep the original content
        summary: `Consolidated: ${memory.summary}`,
        accessCount: allMemories.reduce((sum, m) => sum + m.accessCount, 0),
        relevanceScore: Math.max(...allMemories.map(m => m.relevanceScore)),
        tags: [...new Set(allMemories.flatMap(m => m.tags))],
        entities: [...new Set(allMemories.flatMap(m => m.entities || []))],
        consolidatedFrom: allMemories.map(m => m.id),
        lastUpdated: new Date(),
        metadata: {
          ...memory.metadata,
          consolidatedCount: allMemories.length,
          originalMemories: allMemories.map(m => ({
            id: m.id,
            created: m.created,
            summary: m.summary
          }))
        }
      };
      
      consolidated.push(consolidatedMemory);
      mergeMap.set(consolidatedMemory.id, allMemories.map(m => m.id));
    } else {
      consolidated.push(memory);
    }
    
    processed.add(memory.id);
  }
  
  return { consolidated, mergeMap };
}

// Calculate memory importance score
export function calculateImportanceScore(memory: Memory): number {
  const ageInDays = (Date.now() - memory.created.getTime()) / (1000 * 60 * 60 * 24);
  const recencyFactor = Math.exp(-ageInDays / 90); // 90-day half-life
  
  const accessFactor = Math.log10(memory.accessCount + 1) / 2; // Logarithmic access boost
  const confidenceFactor = memory.confidence;
  const typeFactor = getTypeImportance(memory.type);
  
  return (
    recencyFactor * 0.3 +
    accessFactor * 0.2 +
    confidenceFactor * 0.3 +
    typeFactor * 0.2
  );
}

// Get importance weight for memory type
function getTypeImportance(type: MemoryType): number {
  const weights: Record<MemoryType, number> = {
    [MemoryType.BREAKTHROUGH]: 0.9,
    [MemoryType.ERROR_RECOVERY]: 0.8,
    [MemoryType.DECISION]: 0.7,
    [MemoryType.PATTERN]: 0.7,
    [MemoryType.USER_PREFERENCE]: 0.6,
    [MemoryType.FEEDBACK]: 0.5
  };
  
  return weights[type] || 0.5;
} 