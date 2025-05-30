import { z } from "zod";
import axios from "axios";
import { extractRepoInfo, GitPlatform } from "../../utils/gitUtils.js";
import * as path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";
import * as fsPromises from "fs/promises";

// Schema for PR analysis tool
export const pullRequestSchema = z.object({
  prUrl: z
    .string()
    .url()
    .describe("The URL of the pull request to fetch and organize data from (GitHub, GitLab, Bitbucket supported)"),
  includeLineByLine: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include the full diff content for each file (more detailed but longer)"),
  action: z
    .enum(["review", "fix", "rebuild"])
    .optional()
    .default("review")
    .describe("Data organization mode: 'review' for reviewer perspective (default), 'fix' for author perspective with CI/test status, 'rebuild' for extracting full context"),
});

// Simplified interfaces for PR data (no analysis)
export interface PRDataResult {
  title: string;
  description: string;
  author: string;
  branch: {
    source: string;
    target: string;
  };
  stats: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  files: FileData[];
  context: ContextData;
  action: "review" | "fix" | "rebuild";
}

export interface FileData {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patch?: string; // The raw diff patch if includeLineByLine is true
}

// Add this interface near the top:
interface GitHubPRData {
  title: string;
  body?: string;
  user?: { login?: string };
  head?: { ref?: string };
  base?: { ref?: string };
  changed_files?: number;
  additions?: number;
  deletions?: number;
  // Add more fields as needed
}

// Types for diff parsing
interface DiffChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

interface DiffFile {
  path: string;
  chunks: DiffChunk[];
  additions: number;
  deletions: number;
}

// Add: ContextData interface for context section
interface ContextData {
  pr_metadata: {
    title: string;
    description: string;
    created_at: string;
    status: string;
    source_branch: string;
    target_branch: string;
    pr_number: number;
    pr_url: string;
    author: {
      username: string;
      profile_url: string;
    };
  };
  changed_files: string[];
  reviewers_status: Array<{
    username: string;
    profile_url: string;
    status: string;
  }>;
  required_checks: Array<{
    name: string;
    status: string;
    details_url?: string;
  }>;
  unresolved_review_threads: Array<{
    path?: string;
    body?: string;
    // TODO: Add more fields as needed
  }>;
  file_diffs_with_blockers: Array<{
    filename: string;
    diff: string;
  }>;
}

// File-based debug logger
function debugLog(msg: string) {
  try {
    fs.appendFileSync("/tmp/pr_tool_debug.log", `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* intentionally ignore logging errors */ }
}

// Replace all DEBUG_LOG console.* calls with debugLog
const DEBUG_LOG = true;

// Main PR analysis function
export async function pullRequest({
  prUrl,
  includeLineByLine = false,
  action = "review",
}: z.infer<typeof pullRequestSchema>) {
  try {
    if (DEBUG_LOG) debugLog(`pullRequest: prUrl=${prUrl}, includeLineByLine=${includeLineByLine}, action=${action}`);
    // Extract repository information from URL
    const repoInfo = extractRepoInfo(prUrl);
    if (!repoInfo) {
      if (DEBUG_LOG) debugLog(`Invalid PR URL: ${prUrl}`);
      throw new Error("Invalid PR URL. Supported platforms: GitHub, GitLab, Bitbucket");
    }

    // Fetch PR data based on platform
    let prData: unknown;
    let diffData: string;
    let contextData: ContextData = {
      pr_metadata: {
        title: '',
        description: '',
        created_at: '',
        status: '',
        source_branch: '',
        target_branch: '',
        pr_number: 0,
        pr_url: prUrl,
        author: { username: '', profile_url: '' },
      },
      changed_files: [],
      reviewers_status: [],
      required_checks: [],
      unresolved_review_threads: [],
      file_diffs_with_blockers: [],
    };

    switch (repoInfo.platform) {
      case GitPlatform.GITHUB: {
        if (DEBUG_LOG) debugLog(`Fetching GitHub PR data for ${JSON.stringify(repoInfo)}`);
        prData = await fetchGitHubPR(repoInfo);
        if (DEBUG_LOG) {
          if (typeof prData === 'object' && prData !== null && 'title' in prData) {
            debugLog(`PR data fetched. Title: ${(prData as { title?: string }).title}`);
          } else {
            debugLog(`PR data fetched. (title not found)`);
          }
        }
        diffData = await fetchGitHubDiff(repoInfo);
        if (DEBUG_LOG) debugLog(`Diff data fetched. Length: ${diffData.length} chars`);
        // Fetch additional context for GitHub
        const githubContext = await fetchGitHubContext(repoInfo, prData);
        if (DEBUG_LOG) debugLog(`GitHub context fetched. Files: ${Array.isArray(githubContext.filesData) ? githubContext.filesData.length : 0}`);
        contextData = processGitHubContext(
          prData,
          githubContext.filesData,
          githubContext.reviewCommentsData,
          githubContext.issueCommentsData,
          githubContext.reviewsData,
          githubContext.statusData,
          githubContext.checkRunsData,
          prUrl
        );
        break;
      }
      case GitPlatform.GITLAB:
      case GitPlatform.BITBUCKET:
        if (DEBUG_LOG) debugLog(`Platform not implemented: ${repoInfo.platform}`);
        throw new Error(`${repoInfo.platform} support not yet implemented`);
      default:
        if (DEBUG_LOG) debugLog(`Unsupported platform: ${repoInfo.platform}`);
        throw new Error(`Unsupported platform: ${repoInfo.platform}`);
    }

    // Collect and organize data without analysis
    const dataResult = await performDataCollection(prData, diffData, includeLineByLine);
    if (DEBUG_LOG) {
      debugLog(`Data collection complete. Files: ${dataResult.files.length}`);
      dataResult.files.forEach(f => {
        const patchLen = typeof f.patch === 'string' ? f.patch.length : 0;
        debugLog(`File: ${f.path}, status: ${f.status}, additions: ${f.additions}, deletions: ${f.deletions}, patch length: ${patchLen}`);
        if (patchLen > 100000) {
          debugLog(`Patch for ${f.path} is very large (${patchLen} chars)`);
        }
        if (!f.patch || patchLen === 0) {
          debugLog(`Patch for ${f.path} is empty!`);
        }
      });
    }
    dataResult.context = contextData;
    dataResult.action = action;

    if (DEBUG_LOG) {
      const manifest = {
        filesCount: dataResult.files.length,
        titlePresent: !!dataResult.title,
        descriptionPresent: !!dataResult.description,
        authorPresent: !!dataResult.author,
        prMetadataPresent: !!dataResult.context?.pr_metadata && Object.keys(dataResult.context.pr_metadata).length > 0,
        changedFilesContextCount: dataResult.context?.changed_files?.length || 0,
        reviewersStatusCount: dataResult.context?.reviewers_status?.length || 0,
        requiredChecksCount: dataResult.context?.required_checks?.length || 0,
        unresolvedReviewThreadsCount: dataResult.context?.unresolved_review_threads?.length || 0,
        fileDiffsWithBlockersCount: dataResult.context?.file_diffs_with_blockers?.length || 0,
        action: dataResult.action
      };
      debugLog(`Data collection manifest before generating report: ${JSON.stringify(manifest)}`);
    }

    // Generate report based on action
    const report = generateDataReport(dataResult, prUrl);
    if (DEBUG_LOG) {
      debugLog(`Final report generated. Length: ${report.length} chars`);
      if (report.length > 100000) {
        debugLog(`Report is very large (${report.length} chars)`);
      }
    }

    // Save report to file
    const savedFilePath = await saveReport(report);
    if (DEBUG_LOG) debugLog(`Report saved to: ${savedFilePath}`);

    return {
      content: [
        {
          type: "text" as const,
          text: report,
        },
      ],
      ephemeral: {
        data: dataResult,
        savedTo: savedFilePath,
      },
    };
  } catch (error: unknown) {
    debugLog(`Error in pullRequest tool: ${error instanceof Error ? error.message : String(error)}`);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during PR data collection.";
    return {
      content: [
        {
          type: "text" as const,
          text: `Error during PR data collection: ${errorMessage}`,
        },
      ],
    };
  }
}

// Platform-specific fetchers
async function fetchGitHubPR(repoInfo: unknown): Promise<unknown> {
  const apiUrl = `https://api.github.com/repos/${(repoInfo as { owner: string; repo: string; prNumber: number }).owner}/${(repoInfo as { owner: string; repo: string; prNumber: number }).repo}/pulls/${(repoInfo as { owner: string; repo: string; prNumber: number }).prNumber}`;
  
  try {
    const headers: Record<string, string> = {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "MCP-Shrimp-Task-Manager", // GitHub requires User-Agent
    };
    
    // Add authorization header if token is available
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    }
    
    const response = await axios.get(apiUrl, { headers });
    
    return response.data;
  } catch (error) {
    if (error instanceof Error && 'response' in error) {
      const axiosError = error as { response?: { status?: number; statusText?: string; headers?: Record<string, string> } };
      const status = axiosError.response?.status;
      const statusText = axiosError.response?.statusText;
      
      if (status === 401) {
        throw new Error(`GitHub API authentication failed. Please check your GITHUB_TOKEN is valid.`);
      } else if (status === 403) {
        const rateLimitRemaining = axiosError.response?.headers?.['x-ratelimit-remaining'];
        if (rateLimitRemaining === '0') {
          throw new Error(`GitHub API rate limit exceeded. Please set a valid GITHUB_TOKEN to increase limits.`);
        }
        throw new Error(`GitHub API access forbidden. This might be a private repository - ensure GITHUB_TOKEN has 'repo' scope.`);
      } else if (status === 404) {
        throw new Error(`Pull request not found. Please check the PR URL is correct and you have access to the repository.`);
      }
      
      throw new Error(`GitHub API error (${status}): ${statusText || ''}`);
    }
    throw error;
  }
}

async function fetchGitHubDiff(repoInfo: unknown): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${(repoInfo as { owner: string; repo: string; prNumber: number }).owner}/${(repoInfo as { owner: string; repo: string; prNumber: number }).repo}/pulls/${(repoInfo as { owner: string; repo: string; prNumber: number }).prNumber}`;
  
  try {
    const headers: Record<string, string> = {
      "Accept": "application/vnd.github.v3.diff",
      "User-Agent": "MCP-Shrimp-Task-Manager",
    };
    
    // Add authorization header if token is available
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    }
    
    const response = await axios.get(apiUrl, {
      headers,
      responseType: "text", // Important for getting raw text diff
    });
    
    return response.data as string;
  } catch (error) {
    if (error instanceof Error && 'response' in error) {
      const axiosError = error as { response?: { status?: number; statusText?: string } };
      const status = axiosError.response?.status;
      if (status === 401) {
        throw new Error(`GitHub API authentication failed while fetching diff.`);
      } else if (status === 403) {
        throw new Error(`GitHub API access forbidden while fetching diff.`);
      }
      throw new Error(`GitHub API error while fetching diff: ${axiosError.response?.statusText || ''}`);
    }
    throw error;
  }
}

// Diff parsing
function parseDiff(diffData: string): DiffFile[] {
  // Basic diff parsing - this is a simplified version
  const files: DiffFile[] = [];
  const lines = diffData.split("\n");
  let currentFile: DiffFile | null = null;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      if (currentFile) {
        files.push(currentFile);
      }
      const match = line.match(/b\/(.+)$/);
      currentFile = {
        path: match ? match[1] : "Unknown",
        chunks: [],
        additions: 0,
        deletions: 0,
      };
    } else if (line.startsWith("@@") && currentFile) {
      // Parse chunk header
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        currentFile.chunks.push({
          oldStart: parseInt(match[1]),
          oldLines: parseInt(match[2] || "1"),
          newStart: parseInt(match[3]),
          newLines: parseInt(match[4] || "1"),
          lines: [],
        });
      }
    } else if (currentFile && currentFile.chunks.length > 0) {
      const currentChunk = currentFile.chunks[currentFile.chunks.length - 1];
      currentChunk.lines.push(line);
      
      if (line.startsWith("+") && !line.startsWith("+++")) {
        currentFile.additions++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        currentFile.deletions++;
      }
    }
  }

  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

// Helper function
function determineFileStatus(file: DiffFile): "added" | "modified" | "deleted" | "renamed" {
  if (file.additions > 0 && file.deletions === 0) return "added";
  if (file.additions === 0 && file.deletions > 0) return "deleted";
  return "modified";
}

// Helper function to save the report
async function saveReport(report: string): Promise<string> {
  try {
    // Get DATA_DIR from environment
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const PROJECT_ROOT = path.resolve(__dirname, "../..");
    const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, "data");
    
    // Create reports directory path
    const reportsDir = path.join(DATA_DIR, "reports");
    
    // Ensure reports directory exists
    await fsPromises.mkdir(reportsDir, { recursive: true });
    
    // Generate filename with timestamp and PR info
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    // The following is a placeholder since repoInfo is unknown
    const filename = `report-${timestamp}.md`;
    const filePath = path.join(reportsDir, filename);
    await fsPromises.writeFile(filePath, report, 'utf-8');
    // Metadata file is omitted since repoInfo is unknown
    return filePath;
  } catch {
    // Don't throw - just log the error and return empty string
    // This way the analysis still works even if saving fails
    return "";
  }
}

// Simplified data collection (no analysis)
async function performDataCollection(
  prData: unknown,
  diffData: string,
  includeLineByLine: boolean
): Promise<PRDataResult> {
  // Parse diff data
  const files = parseDiff(diffData);
  
  // Type assertion: we only call this with GitHub PRs here
  const pr = prData as GitHubPRData;

  // Map files to simplified FileData without analysis
  const fileData: FileData[] = files.map(file => ({
    path: file.path,
    status: determineFileStatus(file),
    additions: file.additions,
    deletions: file.deletions,
    patch: includeLineByLine ? extractFilePatch(diffData, file.path) : undefined,
  }));

  // Return pure data without analysis
  return {
    title: pr.title,
    description: pr.body || "",
    author: pr.user?.login || "Unknown",
    branch: {
      source: pr.head?.ref || "Unknown",
      target: pr.base?.ref || "Unknown",
    },
    stats: {
      filesChanged: pr.changed_files || files.length,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
    },
    files: fileData,
    context: {} as ContextData, // Will be populated by fetchGitHubContext
    action: "review", // Will be set by caller
  };
}

// Helper to extract raw patch for a specific file
function extractFilePatch(diffData: string, filePath: string): string {
  const lines = diffData.split('\n');
  let capturing = false;
  let patch = '';
  
  for (const line of lines) {
    if (line.startsWith('diff --git') && line.includes(filePath)) {
      capturing = true;
    } else if (capturing && line.startsWith('diff --git')) {
      break;
    }
    
    if (capturing) {
      patch += line + '\n';
    }
  }
  
  return patch.trim();
}

// Helper to generate a data report based on the collected data
function generateDataReport(dataResult: PRDataResult, prUrl: string): string {
  const sections: string[] = [];
  
  // Add context section first
  sections.push(generateContextMarkdown(dataResult.context));
  
  // Header
  sections.push(`# Pull Request Data Report`);
  sections.push(`\n**PR:** [${dataResult.title}](${prUrl})`);
  sections.push(`**Author:** ${dataResult.author}`);
  sections.push(`**Branch:** ${dataResult.branch.source} → ${dataResult.branch.target}`);
  sections.push(`**Stats:** ${dataResult.stats.filesChanged} files changed (+${dataResult.stats.additions} -${dataResult.stats.deletions})\n`);

  // Action-specific content
  if (dataResult.action === "fix") {
    sections.push(generateFixActionContent(dataResult.context));
  } else if (dataResult.action === "rebuild") {
    sections.push(generateRebuildActionContent(dataResult.context));
  }

  // Files Section
  sections.push(`## File Changes\n`);
  
  for (const file of dataResult.files) {
    sections.push(`### ${file.path}`);
    sections.push(`**Status:** ${file.status}`);
    sections.push(`**Changes:** +${file.additions} -${file.deletions}\n`);

    // Add raw patch if included
    if (file.patch) {
      sections.push("```diff");
      sections.push(file.patch);
      sections.push("```\n");
    }
  }

  sections.push(`---\n`);
  sections.push(`**Note:** This report organizes PR data for analysis. The agent will perform any code review analysis based on this information.`);

  return sections.join("\n");
}

// Helper to generate fix action specific content
function generateFixActionContent(context: ContextData): string {
  const sections: string[] = [];
  
  // Show failing checks prominently
  if (context.required_checks && context.required_checks.some(check => check.status === "failure")) {
    sections.push(`## ❌ Failing Checks\n`);
    context.required_checks
      .filter(check => check.status === "failure")
      .forEach(check => {
        sections.push(`- **${check.name}**: ${check.status}`);
        if (check.details_url) {
          sections.push(`  [View Details](${check.details_url})`);
        }
      });
    sections.push("");
  }
  
  // Show unresolved comments grouped by reviewer
  if (context.unresolved_review_threads && context.unresolved_review_threads.length > 0) {
    sections.push(`## 📝 Unresolved Review Comments\n`);
    context.unresolved_review_threads.forEach(thread => {
      sections.push(`- **File**: ${thread.path || "unknown"}`);
      sections.push(`  - ${thread.body || ""}`);
    });
    sections.push("");
  }
  
  return sections.join("\n");
}

// Helper to generate rebuild action specific content
function generateRebuildActionContent(context: ContextData): string {
  const sections: string[] = [];
  
  sections.push(`## Rebuild Context\n`);
  sections.push(`This PR contains work that may need to be rebuilt. Below is the full context:\n`);
  
  if (context.pr_metadata.description) {
    sections.push(`### Original PR Intent`);
    sections.push(context.pr_metadata.description);
    sections.push("");
  }
  
  if (context.unresolved_review_threads && context.unresolved_review_threads.length > 0) {
    sections.push(`### Review Feedback`);
    context.unresolved_review_threads.forEach(thread => {
      sections.push(`- **${thread.path || "general"}**: ${thread.body || ""}`);
    });
    sections.push("");
  }
  
  return sections.join("\n");
}

// Add: Helper functions for GitHub context fetching
async function fetchGitHubContext(
  repoInfo: { owner: string; repo: string; prNumber: string },
  prData: unknown
): Promise<{
  filesData: unknown;
  reviewCommentsData: unknown;
  issueCommentsData: unknown;
  reviewsData: unknown;
  statusData: unknown;
  checkRunsData: unknown;
}> {
  const prApiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${repoInfo.prNumber}`;
  const filesApiUrl = `${prApiUrl}/files`;
  const reviewCommentsApiUrl = `${prApiUrl}/comments`;
  const issueCommentsApiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${repoInfo.prNumber}/comments`;
  const reviewsApiUrl = `${prApiUrl}/reviews`;

  // Helper for authenticated requests
  async function githubApiRequest(url: string, acceptHeader = "application/vnd.github.v3+json") {
    const headers: Record<string, string> = {
      "Accept": acceptHeader,
      "User-Agent": "MCP-Shrimp-Task-Manager",
    };
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    }
    const response = await axios.get(url, { headers });
    return response.data;
  }

  // Fetch all context data
  const [filesData, reviewCommentsData, issueCommentsData, reviewsData] = await Promise.all([
    githubApiRequest(filesApiUrl),
    githubApiRequest(reviewCommentsApiUrl),
    githubApiRequest(issueCommentsApiUrl),
    githubApiRequest(reviewsApiUrl),
  ]);

  // Fetch status checks and check runs
  let statusData: unknown = undefined;
  let checkRunsData: unknown = undefined;
  const pr = prData as { head?: { sha?: string } };
  if (pr.head && typeof pr.head === 'object' && 'sha' in pr.head) {
    const sha = pr.head.sha;
    const statusApiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/commits/${sha}/status`;
    const checkRunsApiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/commits/${sha}/check-runs`;
    [statusData, checkRunsData] = await Promise.all([
      githubApiRequest(statusApiUrl),
      githubApiRequest(checkRunsApiUrl),
    ]);
  }

  return {
    filesData,
    reviewCommentsData,
    issueCommentsData,
    reviewsData,
    statusData,
    checkRunsData,
  };
}

// Add: Helper to process GitHub context data into a summary object
function processGitHubContext(
  prData: unknown,
  filesData: unknown,
  reviewCommentsData: unknown,
  issueCommentsData: unknown,
  reviewsData: unknown,
  statusData: unknown,
  checkRunsData: unknown,
  prUrl: string
): ContextData {
  // Type assertion for GitHub PR data
  const pr = prData as {
    title: string;
    body?: string;
    created_at: string;
    state: string;
    head?: { ref?: string; sha?: string };
    base?: { ref?: string };
    number: number;
    user?: { login?: string; html_url?: string };
  };
  // PR Metadata
  const pr_metadata = {
    title: pr.title,
    description: pr.body || "",
    created_at: pr.created_at,
    status: pr.state,
    source_branch: pr.head?.ref || '',
    target_branch: pr.base?.ref || '',
    pr_number: pr.number,
    pr_url: prUrl,
    author: {
      username: pr.user?.login || '',
      profile_url: pr.user?.html_url || '',
    },
  };
  // Changed files
  const changed_files = Array.isArray(filesData) ? (filesData as Array<{ filename: string }>).map((f) => f.filename) : [];
  // Reviewer statuses
  const reviewers_status = Array.isArray(reviewsData)
    ? (reviewsData as Array<{ user?: { login?: string; html_url?: string }; state?: string }>).map((r) => ({
        username: r.user?.login || '',
        profile_url: r.user?.html_url || '',
        status: r.state || '',
      }))
    : [];
  // Required checks
  const required_checks: Array<{ name: string; status: string; details_url?: string }> = [];
  if (statusData && Array.isArray((statusData as { statuses?: unknown[] }).statuses)) {
    (statusData as { statuses: Array<{ context: string; state: string; target_url?: string }> }).statuses.forEach((s) => {
      required_checks.push({
        name: s.context,
        status: s.state,
        details_url: s.target_url,
      });
    });
  }
  if (checkRunsData && Array.isArray((checkRunsData as { check_runs?: unknown[] }).check_runs)) {
    (checkRunsData as { check_runs: Array<{ name: string; status: string; conclusion?: string | null; html_url?: string }> }).check_runs.forEach((c) => {
      required_checks.push({
        name: c.name,
        status: c.status === "completed" ? (c.conclusion || c.status) : c.status,
        details_url: c.html_url,
      });
    });
  }
  // Unresolved review threads (simplified: all review comments)
  const unresolved_review_threads = Array.isArray(reviewCommentsData)
    ? (reviewCommentsData as Array<{ resolved?: boolean; path?: string; body?: string }>).filter((c) => !c.resolved)
    : [];
  // File diffs for files with unresolved comments
  const files_with_blockers = new Set(unresolved_review_threads.map((c) => c.path));
  const file_diffs_with_blockers = Array.isArray(filesData)
    ? (filesData as Array<{ filename: string; patch?: string }>)
        .filter((f) => files_with_blockers.has(f.filename))
        .map((f) => ({ filename: f.filename, diff: f.patch || "" }))
    : [];
  return {
    pr_metadata,
    changed_files,
    reviewers_status,
    required_checks,
    unresolved_review_threads,
    file_diffs_with_blockers,
  };
}

// Add: Markdown context section generator
function generateContextMarkdown(context: ContextData): string {
  let md = `# PR Context\n`;
  if (context.pr_metadata) {
    md += `\n## PR: [${context.pr_metadata.title}](${context.pr_metadata.pr_url})\n`;
    md += `- **Author:** [${context.pr_metadata.author.username}](${context.pr_metadata.author.profile_url})\n`;
    md += `- **Status:** ${context.pr_metadata.status}\n`;
    md += `- **Source branch:** ${context.pr_metadata.source_branch}\n`;
    md += `- **Target branch:** ${context.pr_metadata.target_branch}\n`;
    md += `- **Created at:** ${new Date(context.pr_metadata.created_at).toLocaleString()}\n`;
    if (context.pr_metadata.description) {
      md += `\n### Description\n${context.pr_metadata.description}\n`;
    }
  }
  if (context.required_checks && context.required_checks.length > 0) {
    md += `\n## Required Checks (Merge Blockers)\n`;
    context.required_checks.forEach((check) => {
      const statusIcon = check.status === "success" ? "✅" : check.status === "failure" ? "❌" : check.status === "pending" ? "⏳" : "➖";
      md += `- **${check.name}:** ${statusIcon} ${check.status}`;
      if (check.details_url) {
        md += ` ([details](${check.details_url}))`;
      }
      md += `\n`;
    });
  }
  if (context.reviewers_status && context.reviewers_status.length > 0) {
    md += `\n## Reviewers\n`;
    context.reviewers_status.forEach((reviewer) => {
      md += `- [@${reviewer.username}](${reviewer.profile_url}): ${reviewer.status}\n`;
    });
  }
  if (context.unresolved_review_threads && context.unresolved_review_threads.length > 0) {
    md += `\n## Unresolved Review Threads\n`;
    context.unresolved_review_threads.forEach((thread) => {
      md += `- File: ${thread.path || "unknown"}\n`;
      md += `  - Comment: ${thread.body || ""}\n`;
    });
  }
  if (context.changed_files && context.changed_files.length > 0) {
    md += `\n## Changed Files\n`;
    context.changed_files.forEach((file) => {
      md += `- ${file}\n`;
    });
  }
  if (context.file_diffs_with_blockers && context.file_diffs_with_blockers.length > 0) {
    md += `\n## Diffs for Files with Unresolved Comments\n`;
    context.file_diffs_with_blockers.forEach((file) => {
      md += `### ${file.filename}\n`;
      md += "```diff\n";
      md += file.diff;
      md += "\n```\n";
    });
  }
  return md + "\n---\n";
} 