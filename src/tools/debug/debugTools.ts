import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";

// Schema for the log_data_dir tool (no input needed)
export const logDataDirSchema = z.object({});

/**
 * Logs the path to the tasks.json file based on the configured DATA_DIR.
 */
export async function logDataDir() {
  try {
    // Determine the project root and data directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Navigate up two levels from src/tools to the project root
    const PROJECT_ROOT = path.resolve(__dirname, "../..");
    // Read DATA_DIR from environment or use default
    const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, "data");

    if (!path.isAbsolute(DATA_DIR)) {
      console.warn(
        `⚠️ Warning: DATA_DIR "${DATA_DIR}" is not an absolute path. This might lead to unexpected behavior. Falling back to default relative path logic for logging, but the application might fail if DATA_DIR is not absolute.`
      );
      // Even with warning, proceed to show the calculated path for debugging purposes
    }

    const tasksJsonPath = path.join(DATA_DIR, 'tasks.json');

    const message = `Shrimp Task Manager is configured to use the following path for tasks.json: ${tasksJsonPath}`;

    // NOTE: Removed console.log here as it interfered with MCP JSON communication

    return {
      content: [
        {
          type: "text" as const,
          text: message,
        },
      ],
    };
  } catch (error) {
    console.error("Error in logDataDir tool:", error);
    const errorMessage = `Error determining tasks.json path: ${error instanceof Error ? error.message : String(error)}`;
    return {
      content: [
        {
          type: "text" as const,
          text: errorMessage,
        },
      ],
      isError: true,
    };
  }
}

// Schema for checking environment variables
export const checkEnvSchema = z.object({});

// Tool function to check environment variables
export async function checkEnv() {
  const envVars = {
    DATA_DIR: process.env.DATA_DIR || "(not set)",
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ? `Set (${process.env.GITHUB_TOKEN.substring(0, 10)}...)` : "(not set)",
    ENABLE_THOUGHT_CHAIN: process.env.ENABLE_THOUGHT_CHAIN || "(not set)",
    TEMPLATES_USE: process.env.TEMPLATES_USE || "(not set)",
    ENABLE_GUI: process.env.ENABLE_GUI || "(not set)",
  };

  const message = `## Environment Variables Check\n\n${Object.entries(envVars)
    .map(([key, value]) => `- **${key}**: ${value}`)
    .join('\n')}`;

  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
}
