import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique project ID
 */
export function generateProjectId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `proj_${timestamp}_${random}`;
}

/**
 * Generate a unique context ID
 */
export function generateContextId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ctx_${timestamp}_${random}`;
}

/**
 * Generate a unique insight ID
 */
export function generateInsightId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ins_${timestamp}_${random}`;
}

/**
 * Ensure a project ID is unique by checking against existing projects
 * This is a placeholder - in the real implementation it would check against storage
 */
export async function ensureUniqueProjectId(baseId: string, existingIds: string[]): Promise<string> {
  let id = baseId;
  let counter = 1;
  
  while (existingIds.includes(id)) {
    id = `${baseId}_${counter}`;
    counter++;
  }
  
  return id;
}

/**
 * Generate a UUID (for backward compatibility)
 */
export function generateId(): string {
  return uuidv4();
} 