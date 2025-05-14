import { spawn } from "child_process";

/**
 * IMPORTANT: In the agent-driven workflow, these are helper/documentation functions only.
 * The agent is responsible for actually running all git commands locally, not the tool.
 * These functions only document what commands the agent should run and how to process their output.
 */

/**
 * Documents how to run a git command and capture its output.
 * This is a reference function for the agent, not to be executed directly by the tool.
 */
export async function runGitCommand(cmd: string, args: string[], options: object = {}): Promise<string> {
  return `AGENT: Please run the following git command and return its output:
${cmd} ${args.join(' ')}`;
}

/**
 * Documents how to get a list of changed files using git status --porcelain.
 * The agent should parse the output to get file paths.
 */
export function getChangedFiles(): string {
  return `AGENT: Please run 'git status --porcelain' to list all changed files.
Parse the output, where each line follows this format: "XY filename".
X represents the status in the index, Y represents the status in the working tree.
Return only the filenames (removing the XY prefix and space).`;
}

/**
 * Documents how to get the diff for a specific file.
 */
export function getFileDiff(file: string): string {
  return `AGENT: Please run 'git diff ${file}' to get the diff content for this file.
Return the full diff output as a string, or a truncated version if it's very large.`;
}

/**
 * Documents how to get the current branch name.
 */
export function getCurrentBranch(): string {
  return `AGENT: Please run 'git rev-parse --abbrev-ref HEAD' to get the current branch name.
Return the output (branch name) as a string.`;
}

/**
 * Documents how to get recent commits as an array of strings.
 */
export function getRecentCommits(n: number = 5): string {
  return `AGENT: Please run 'git log -n ${n} --oneline' to get the last ${n} commits.
Return the output as a string with each commit on a new line.`;
} 