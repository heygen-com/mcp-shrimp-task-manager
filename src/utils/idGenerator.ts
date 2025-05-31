import { v4 as uuidv4 } from 'uuid';

// Utility to slugify a string for filesystem-safe folder names
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .substring(0, 32); // limit length for sanity
}

/**
 * Generate a unique project ID (now includes semantic slug)
 */
export function generateProjectId(name?: string): string {
  const slug = name ? slugifyName(name) : 'project';
  const now = new Date();
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const id = `${slug}_${datePart}_${timePart}_${now.getMilliseconds()}`;
  return id;
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