import fs from 'fs/promises';
import path from 'path';

// Use a hardcoded absolute path for reliability
const LOG_DIR = '/Users/co/dev/agents/shared/mcp-shrimp-task-manager/.cursor/logs';
const LOG_FILE_PATH = path.join(LOG_DIR, 'server.log');

// Helper function to ensure log directory exists
async function ensureLogDirectoryExists(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error: unknown) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code !== 'EEXIST') {
      console.error(`[Log Util Error] Failed to create log directory: ${LOG_DIR}`, error);
      throw error; // Rethrow if it's not an 'already exists' error
    }
  }
}

// Ensure directory exists once when the module loads
ensureLogDirectoryExists().catch(err => {
  // Keep this console error as it happens only once on module load if fails
  console.error('[Log Util Error] Initial directory check/creation failed:', err); 
});

// Function to append a log message to the file
export async function logToFile(message: string): Promise<void> {
  // Remove console log attempt
  // console.log(`[Log Util] Attempting to log: "${message.substring(0,100)}..."`); 
  try {
    // Directory existence check moved to module load, but can double-check if needed
    // await ensureLogDirectoryExists(); 

    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;

    await fs.appendFile(LOG_FILE_PATH, logMessage, 'utf-8');
    // Remove console log success
    // console.log(`[Log Util] Successfully appended to ${LOG_FILE_PATH}`); 

  } catch (error) {
    // Log errors to console if file logging fails
    console.error(`[Log Util Error] Failed to write to log file ${LOG_FILE_PATH}:`, error);
    console.error(`[Log Util Original Message]: ${message}`);
    // Optionally, rethrow or handle the error differently
  }
} 