import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/*
// 確保獲取專案資料夾路徑
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// 數據文件路徑
const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, "data");
const LOG_FILE = path.join(DATA_DIR, "mcp_shrimp_task_manager.log");

// 確保數據目錄存在
async function ensureDataDirForLog() {
  try {
    await fs.access(DATA_DIR);
  } catch (error) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// 將訊息記錄到文件
export async function logToFile(message: string): Promise<void> {
  await ensureDataDirForLog();
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;

  try {
    await fs.appendFile(LOG_FILE, logMessage);
  } catch (error) {
    console.error("Failed to write to log file:", error);
  }
}
*/

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