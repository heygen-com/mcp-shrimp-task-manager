import { z } from "zod";
import axios from "axios";
import { extractRepoInfo, GitPlatform } from "../../utils/gitUtils.js";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

// Schema for PR analysis tool
export const pullRequestSchema = z.object({
  prUrl: z
    .string()
    .url()
    .describe("The URL of the pull request to analyze (GitHub, GitLab, Bitbucket supported)"),
  includeLineByLine: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include line-by-line analysis in the diff (more detailed but longer)"),
  focusAreas: z
    .array(z.string())
    .optional()
    .describe("Specific areas to focus on during analysis (e.g., security, performance, code style)"),
  action: z
    .enum(["review", "fix", "rebuild"])
    .optional()
    .default("review")
    .describe("Action to perform: 'review' for code review, 'fix' for author addressing feedback, 'rebuild' for extracting context and a rebuild plan"),
});

// Interface for PR analysis result
export interface PRAnalysisResult {
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
  files: FileAnalysis[];
  comments: PRComment[];
  issues: PRIssue[];
  summary: PRSummary;
}

export interface FileAnalysis {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  diffs: DiffBlock[];
  assessment: {
    quality: "excellent" | "good" | "needs-improvement" | "poor";
    suggestions: string[];
    concerns: string[];
  };
}

export interface DiffBlock {
  startLine: number;
  endLine: number;
  type: "addition" | "deletion" | "modification";
  content: string;
  analysis?: string;
}

export interface PRComment {
  author: string;
  timestamp: Date;
  content: string;
  resolved: boolean;
}

export interface PRIssue {
  severity: "critical" | "major" | "minor" | "suggestion";
  type: "bug" | "security" | "performance" | "style" | "maintainability" | "other";
  file?: string;
  line?: number;
  description: string;
  suggestion?: string;
}

export interface PRSummary {
  overview: string;
  keyChanges: string[];
  qualityScore: number; // 0-100
  recommendations: string[];
  risks: string[];
  technicalDebt: string[];
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

// Add FixMeta and related interfaces for type safety
interface FailingTest {
  name: string;
  status: string;
  link: string;
}

interface MergeConflict {
  file: string;
  link: string;
}

interface GroupedComment {
  reviewer: string;
  mustFix: string[];
  suggestions: string[];
  unresolved: string[];
}

interface FixMeta {
  failingTests: FailingTest[];
  mergeConflicts: MergeConflict[];
  groupedComments: GroupedComment[];
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

// Main PR analysis function
export async function pullRequest({
  prUrl,
  includeLineByLine = false,
  focusAreas = [],
  action = "review",
}: z.infer<typeof pullRequestSchema>) {
  try {
    // Extract repository information from URL
    const repoInfo = extractRepoInfo(prUrl);
    if (!repoInfo) {
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
    let githubContextRaw: {
      filesData: unknown;
      reviewCommentsData: unknown;
      issueCommentsData: unknown;
      reviewsData: unknown;
      statusData: unknown;
      checkRunsData: unknown;
    } | undefined = undefined;
    switch (repoInfo.platform) {
      case GitPlatform.GITHUB:
        prData = await fetchGitHubPR(repoInfo);
        diffData = await fetchGitHubDiff(repoInfo);
        githubContextRaw = await fetchGitHubContext(repoInfo, prData);
        contextData = processGitHubContext(
          prData,
          githubContextRaw.filesData,
          githubContextRaw.reviewCommentsData,
          githubContextRaw.issueCommentsData,
          githubContextRaw.reviewsData,
          githubContextRaw.statusData,
          githubContextRaw.checkRunsData,
          prUrl
        );
        break;
      case GitPlatform.GITLAB:
      case GitPlatform.BITBUCKET:
        prData = await (repoInfo.platform === GitPlatform.GITLAB ? fetchGitLabPR() : fetchBitbucketPR());
        diffData = await (repoInfo.platform === GitPlatform.GITLAB ? fetchGitLabDiff() : fetchBitbucketDiff());
        // TODO: Add context fetching for GitLab/Bitbucket
        contextData = {
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
        break;
      default:
        throw new Error(`Unsupported platform: ${repoInfo.platform}`);
    }

    // Analyze the PR with action
    const analysis = await performAnalysisWithAction(prData, diffData, includeLineByLine, focusAreas, action, prUrl);

    // Generate markdown report based on action, with context at the top
    const report = generateMarkdownReportWithContext(analysis, prUrl, action, contextData);

    // Save report to file
    const savedFilePath = await saveReport(report);

    return {
      content: [
        {
          type: "text" as const,
          text: report,
        },
      ],
      ephemeral: {
        analysis: analysis,
        context: contextData,
        savedTo: savedFilePath,
      },
    };
  } catch (error: unknown) {
    console.error("Error in pullRequest tool:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during PR analysis.";
    return {
      content: [
        {
          type: "text" as const,
          text: `Error during PR analysis: ${errorMessage}`,
        },
      ],
    };
  }
}

// Platform-specific fetchers (simplified for now, can be expanded)
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

// Placeholder functions for other platforms
async function fetchGitLabPR(): Promise<unknown> {
  throw new Error("GitLab support not yet implemented");
}

async function fetchGitLabDiff(): Promise<string> {
  throw new Error("GitLab support not yet implemented");
}

async function fetchBitbucketPR(): Promise<unknown> {
  throw new Error("Bitbucket support not yet implemented");
}

async function fetchBitbucketDiff(): Promise<string> {
  throw new Error("Bitbucket support not yet implemented");
}

// Analysis logic
async function performAnalysis(
  prData: unknown,
  diffData: string,
  includeLineByLine: boolean,
  focusAreas: string[]
): Promise<PRAnalysisResult> {
  // Parse diff data
  const files = parseDiff(diffData);

  // Analyze each file
  const fileAnalyses: FileAnalysis[] = files.map(file => analyzeFile(file, includeLineByLine, focusAreas));

  // Extract comments and issues
  const comments = extractComments();
  const issues = identifyIssues(fileAnalyses);

  // Type assertion: we only call performAnalysis with GitHub PRs here
  const pr = prData as GitHubPRData;

  // Generate summary
  const summary = generateSummary(pr, fileAnalyses, issues);

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
    files: fileAnalyses,
    comments,
    issues,
    summary,
  };
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

// File analysis
function analyzeFile(file: DiffFile, includeLineByLine: boolean, focusAreas: string[]): FileAnalysis {
  const diffs: DiffBlock[] = [];
  const suggestions: string[] = [];
  const concerns: string[] = [];

  // Analyze each chunk
  for (const chunk of file.chunks || []) {
    const diffBlock = analyzeChunk(chunk, includeLineByLine);
    diffs.push(...diffBlock);

    // Check for common issues
    const chunkIssues = checkChunkIssues(chunk, focusAreas);
    concerns.push(...chunkIssues.concerns);
    suggestions.push(...chunkIssues.suggestions);
  }

  // Determine quality based on analysis
  const quality = determineQuality(concerns, suggestions);

  return {
    path: file.path,
    status: determineFileStatus(file),
    additions: file.additions,
    deletions: file.deletions,
    diffs,
    assessment: {
      quality,
      suggestions: [...new Set(suggestions)], // Remove duplicates
      concerns: [...new Set(concerns)],
    },
  };
}

// Helper functions
function analyzeChunk(chunk: DiffChunk, includeLineByLine: boolean): DiffBlock[] {
  // Simplified chunk analysis
  return [{
    startLine: chunk.newStart,
    endLine: chunk.newStart + chunk.newLines - 1,
    type: "modification" as const,
    content: chunk.lines.join("\n"),
    analysis: includeLineByLine ? "Line-by-line analysis would go here" : undefined,
  }];
}

function checkChunkIssues(chunk: DiffChunk, focusAreas: string[]): { concerns: string[], suggestions: string[] } {
  const concerns: string[] = [];
  const suggestions: string[] = [];

  // Basic checks (can be expanded)
  const codeContent = chunk.lines.join("\n");
  
  // Security checks
  if (focusAreas.includes("security") || focusAreas.length === 0) {
    if (codeContent.includes("eval(") || codeContent.includes("exec(")) {
      concerns.push("Potential security risk: Use of eval/exec detected");
    }
  }

  // Performance checks
  if (focusAreas.includes("performance") || focusAreas.length === 0) {
    if (codeContent.includes("SELECT * FROM")) {
      suggestions.push("Consider specifying columns instead of using SELECT *");
    }
  }

  return { concerns, suggestions };
}

function determineFileStatus(file: DiffFile): "added" | "modified" | "deleted" | "renamed" {
  if (file.additions > 0 && file.deletions === 0) return "added";
  if (file.additions === 0 && file.deletions > 0) return "deleted";
  return "modified";
}

function determineQuality(concerns: string[], suggestions: string[]): "excellent" | "good" | "needs-improvement" | "poor" {
  if (concerns.length === 0 && suggestions.length === 0) return "excellent";
  if (concerns.length === 0 && suggestions.length <= 2) return "good";
  if (concerns.length <= 2) return "needs-improvement";
  return "poor";
}

function extractComments(): PRComment[] {
  // For now, return empty array - would need to fetch comments separately
  return [];
}

function identifyIssues(fileAnalyses: FileAnalysis[]): PRIssue[] {
  const issues: PRIssue[] = [];

  for (const file of fileAnalyses) {
    // Convert concerns to issues
    for (const concern of file.assessment.concerns) {
      issues.push({
        severity: "major",
        type: determineIssueType(concern),
        file: file.path,
        description: concern,
      });
    }

    // Convert suggestions to issues
    for (const suggestion of file.assessment.suggestions) {
      issues.push({
        severity: "suggestion",
        type: determineIssueType(suggestion),
        file: file.path,
        description: suggestion,
      });
    }
  }

  return issues;
}

function determineIssueType(description: string): "bug" | "security" | "performance" | "style" | "maintainability" | "other" {
  const lowercased = description.toLowerCase();
  if (lowercased.includes("security") || lowercased.includes("eval") || lowercased.includes("injection")) return "security";
  if (lowercased.includes("performance") || lowercased.includes("slow") || lowercased.includes("optimize")) return "performance";
  if (lowercased.includes("style") || lowercased.includes("format") || lowercased.includes("naming")) return "style";
  if (lowercased.includes("maintainability") || lowercased.includes("readable") || lowercased.includes("complex")) return "maintainability";
  if (lowercased.includes("bug") || lowercased.includes("error") || lowercased.includes("fix")) return "bug";
  return "other";
}

function generateSummary(prData: unknown, fileAnalyses: FileAnalysis[], issues: PRIssue[]): PRSummary {
  // Type assertion: we only call generateSummary with GitHub PRs here
  const pr = prData as GitHubPRData;
  const keyChanges: string[] = [];
  const recommendations: string[] = [];
  const risks: string[] = [];
  const technicalDebt: string[] = [];

  // Analyze file changes
  for (const file of fileAnalyses) {
    if (file.status === "added") {
      keyChanges.push(`Added new file: ${file.path}`);
    } else if (file.deletions > file.additions * 2) {
      keyChanges.push(`Major refactoring in: ${file.path}`);
    }

    // Collect recommendations
    recommendations.push(...file.assessment.suggestions);

    // Identify risks
    if (file.assessment.quality === "poor") {
      risks.push(`Code quality concerns in ${file.path}`);
    }
  }

  // Calculate quality score
  const totalFiles = fileAnalyses.length;
  const qualityScores = {
    "excellent": 100,
    "good": 80,
    "needs-improvement": 60,
    "poor": 40,
  };
  
  const averageQuality = fileAnalyses.reduce((sum, file) => 
    sum + qualityScores[file.assessment.quality], 0) / totalFiles;

  // Identify critical issues
  const criticalIssues = issues.filter(issue => issue.severity === "critical");
  if (criticalIssues.length > 0) {
    risks.push(`${criticalIssues.length} critical issues found`);
  }

  return {
    overview: `This PR ${pr.title} contains ${totalFiles} file changes with ${pr.additions} additions and ${pr.deletions} deletions.`,
    keyChanges: [...new Set(keyChanges)].slice(0, 5), // Top 5 unique changes
    qualityScore: Math.round(averageQuality),
    recommendations: [...new Set(recommendations)].slice(0, 5), // Top 5 unique recommendations
    risks: [...new Set(risks)],
    technicalDebt,
  };
}

// Generate markdown report
function generateMarkdownReport(analysis: PRAnalysisResult, prUrl: string): string {
  const sections: string[] = [];

  // Header
  sections.push(`# Pull Request Analysis Report`);
  sections.push(`\n**PR:** [${analysis.title}](${prUrl})`);
  sections.push(`**Author:** ${analysis.author}`);
  sections.push(`**Branch:** ${analysis.branch.source} → ${analysis.branch.target}`);
  sections.push(`**Stats:** ${analysis.stats.filesChanged} files changed (+${analysis.stats.additions} -${analysis.stats.deletions})\n`);

  // Comments Section (at the very top, before summary)
  if (analysis.comments && analysis.comments.length > 0) {
    sections.push(`---`);
    sections.push(`## 💬 PR Comments`);
    analysis.comments.forEach((comment, idx) => {
      const date = new Date(comment.timestamp);
      const friendly = date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      sections.push(`**${comment.author}** commented on _${friendly}_ ${comment.resolved ? '✅ (resolved)' : ''}`);
      sections.push(`> ${comment.content.replace(/\n/g, '\n> ')}`);
      if (idx < analysis.comments.length - 1) {
        sections.push(`\n---\n`);
      }
    });
    sections.push('');
  }

  // Summary Section
  sections.push(`## Summary\n`);
  sections.push(`${analysis.summary.overview}\n`);
  sections.push(`**Quality Score:** ${analysis.summary.qualityScore}/100\n`);

  if (analysis.summary.keyChanges.length > 0) {
    sections.push(`### Key Changes`);
    analysis.summary.keyChanges.forEach(change => {
      sections.push(`- ${change}`);
    });
    sections.push("");
  }

  // Files Section
  sections.push(`## File Changes\n`);
  
  for (const file of analysis.files) {
    sections.push(`### ${file.path}`);
    sections.push(`**Status:** ${file.status} | **Quality:** ${file.assessment.quality}`);
    sections.push(`**Changes:** +${file.additions} -${file.deletions}\n`);

    // Add diff blocks
    if (file.diffs.length > 0) {
      sections.push("```diff");
      for (const diff of file.diffs) {
        sections.push(diff.content);
      }
      sections.push("```\n");
    }

    // Add assessment
    if (file.assessment.concerns.length > 0) {
      sections.push(`**Concerns:**`);
      file.assessment.concerns.forEach(concern => {
        sections.push(`- ⚠️ ${concern}`);
      });
      sections.push("");
    }

    if (file.assessment.suggestions.length > 0) {
      sections.push(`**Suggestions:**`);
      file.assessment.suggestions.forEach(suggestion => {
        sections.push(`- 💡 ${suggestion}`);
      });
      sections.push("");
    }
  }

  // Issues Section
  if (analysis.issues.length > 0) {
    sections.push(`## Issues Found\n`);
    
    const issuesBySeverity = analysis.issues.reduce((acc, issue) => {
      if (!acc[issue.severity]) acc[issue.severity] = [];
      acc[issue.severity].push(issue);
      return acc;
    }, {} as Record<string, PRIssue[]>);

    for (const [severity, severityIssues] of Object.entries(issuesBySeverity)) {
      sections.push(`### ${severity.charAt(0).toUpperCase() + severity.slice(1)}`);
      for (const issue of severityIssues) {
        const location = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ""})` : "";
        sections.push(`- **[${issue.type}]** ${issue.description}${location}`);
        if (issue.suggestion) {
          sections.push(`  - Suggestion: ${issue.suggestion}`);
        }
      }
      sections.push("");
    }
  }

  // Recommendations Section
  if (analysis.summary.recommendations.length > 0 || analysis.summary.risks.length > 0) {
    sections.push(`## Recommendations & Risks\n`);
    
    if (analysis.summary.recommendations.length > 0) {
      sections.push(`### Recommendations`);
      analysis.summary.recommendations.forEach(rec => {
        sections.push(`- ${rec}`);
      });
      sections.push("");
    }

    if (analysis.summary.risks.length > 0) {
      sections.push(`### Risks`);
      analysis.summary.risks.forEach(risk => {
        sections.push(`- 🚨 ${risk}`);
      });
      sections.push("");
    }
  }

  return sections.join("\n");
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
    await fs.mkdir(reportsDir, { recursive: true });
    
    // Generate filename with timestamp and PR info
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    // The following is a placeholder since repoInfo is unknown
    const filename = `report-${timestamp}.md`;
    const filePath = path.join(reportsDir, filename);
    await fs.writeFile(filePath, report, 'utf-8');
    // Metadata file is omitted since repoInfo is unknown
    return filePath;
  } catch {
    // Don't throw - just log the error and return empty string
    // This way the analysis still works even if saving fails
    return "";
  }
}

// New: Perform analysis with action branching
async function performAnalysisWithAction(
  prData: unknown,
  diffData: string,
  includeLineByLine: boolean,
  focusAreas: string[],
  action: "review" | "fix" | "rebuild",
  prUrl: string
): Promise<PRAnalysisResult | (PRAnalysisResult & { fixMeta: FixMeta })> {
  if (action === "review") {
    // Standard review analysis (existing logic)
    return await performAnalysis(prData, diffData, includeLineByLine, focusAreas);
  } else if (action === "fix") {
    // Fix-focused analysis
    // TODO: Fetch CI/test status, merge conflicts, and real comments from platform APIs
    // For now, use placeholders for these fields
    const baseAnalysis = await performAnalysis(prData, diffData, includeLineByLine, focusAreas);
    // Placeholder: Failing tests, merge conflicts, and grouped comments
    const failingTests: FailingTest[] = [
      // TODO: Replace with real CI status fetching
      { name: "unit-test", status: "failed", link: `${prUrl}/checks` },
    ];
    const mergeConflicts: MergeConflict[] = [
      // TODO: Replace with real merge conflict detection
      { file: "src/conflictedFile.ts", link: `${prUrl}/files` },
    ];
    const groupedComments: GroupedComment[] = [
      // TODO: Replace with real grouped comments by reviewer
      {
        reviewer: "reviewer1",
        mustFix: ["Please fix the bug in src/foo.ts"],
        suggestions: ["Consider refactoring bar() for clarity."],
        unresolved: ["What about edge case X?"],
      },
    ];
    return {
      ...baseAnalysis,
      fixMeta: {
        failingTests,
        mergeConflicts,
        groupedComments,
      },
    };
  } else if (action === "rebuild") {
    // Rebuild-focused analysis
    // TODO: Implement rebuild logic
    return await performAnalysis(prData, diffData, includeLineByLine, focusAreas);
  }
  // fallback (should not reach here)
  return await performAnalysis(prData, diffData, includeLineByLine, focusAreas);
}

// New: Generate markdown report with action branching
function generateMarkdownReportWithAction(
  analysis: PRAnalysisResult | (PRAnalysisResult & { fixMeta: FixMeta }),
  prUrl: string,
  action: "review" | "fix" | "rebuild"
): string {
  if (action === "review") {
    // Standard review report (existing logic)
    return generateMarkdownReport(analysis, prUrl);
  } else if (action === "fix") {
    // Fix-focused actionable checklist
    const sections: string[] = [];
    sections.push(`# Pull Request Fix Report`);
    sections.push(`\n**PR:** [${analysis.title}](${prUrl})`);
    sections.push(`**Author:** ${analysis.author}`);
    sections.push(`**Branch:** ${analysis.branch.source} → ${analysis.branch.target}`);
    sections.push(`**Stats:** ${analysis.stats.filesChanged} files changed (+${analysis.stats.additions} -${analysis.stats.deletions})\n`);
    // Failing tests
    if ((analysis as { fixMeta?: FixMeta }).fixMeta?.failingTests?.length) {
      sections.push(`## ❌ Failing CI/Tests`);
      (analysis as { fixMeta: FixMeta }).fixMeta.failingTests.forEach((test: FailingTest) => {
        sections.push(`- [${test.name}](${test.link}): **${test.status}**`);
      });
      sections.push("");
    }
    // Merge conflicts
    if ((analysis as { fixMeta?: FixMeta }).fixMeta?.mergeConflicts?.length) {
      sections.push(`## ⚠️ Merge Conflicts`);
      (analysis as { fixMeta: FixMeta }).fixMeta.mergeConflicts.forEach((conflict: MergeConflict) => {
        sections.push(`- [${conflict.file}](${conflict.link})`);
      });
      sections.push("");
    }
    // Grouped comments by reviewer
    if ((analysis as { fixMeta?: FixMeta }).fixMeta?.groupedComments?.length) {
      sections.push(`## 📝 Review Feedback (Grouped by Reviewer)`);
      (analysis as { fixMeta: FixMeta }).fixMeta.groupedComments.forEach((group: GroupedComment) => {
        sections.push(`### Reviewer: ${group.reviewer}`);
        if (group.mustFix?.length) {
          sections.push(`**Must Fix:**`);
          group.mustFix.forEach((item: string) => sections.push(`- [ ] ${item}`));
        }
        if (group.unresolved?.length) {
          sections.push(`**Unresolved:**`);
          group.unresolved.forEach((item: string) => sections.push(`- [ ] ${item}`));
        }
        if (group.suggestions?.length) {
          sections.push(`**Suggestions (Nice to Have):**`);
          group.suggestions.forEach((item: string) => sections.push(`- [ ] ${item}`));
        }
        sections.push("");
      });
    }
    // PR readiness checklist
    sections.push(`## ✅ PR Readiness Checklist`);
    sections.push(`- [ ] All failing tests resolved`);
    sections.push(`- [ ] All must-fix review comments addressed`);
    sections.push(`- [ ] All merge conflicts resolved`);
    sections.push(`- [ ] All unresolved comments addressed`);
    sections.push("");
    // Optionally, add file changes summary
    sections.push(`## File Changes (Summary)`);
    for (const file of analysis.files) {
      sections.push(`- ${file.path}: +${file.additions} -${file.deletions}`);
    }
    return sections.join("\n");
  } else if (action === "rebuild") {
    // Rebuild action should not reach this function - it's handled in generateMarkdownReportWithContext
    throw new Error("Rebuild action should be handled by generateMarkdownReportWithContext");
  }
  return "";
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

// Add: Unified markdown report generator with context at the top
function generateMarkdownReportWithContext(
  analysis: PRAnalysisResult | (PRAnalysisResult & { fixMeta: FixMeta }),
  prUrl: string,
  action: "review" | "fix" | "rebuild",
  context: ContextData
): string {
  const contextSection = generateContextMarkdown(context);
  let rest = "";
  if (action === "rebuild") {
    rest = generateRebuildReport(prUrl, context);
  } else {
    rest = generateMarkdownReportWithAction(analysis, prUrl, action);
  }
  return contextSection + "\n" + rest;
}

// Add: Rebuild report generator
function generateRebuildReport(prUrl: string, context: ContextData): string {
  const sections: string[] = [];
  sections.push(`# PR Rebuild Plan`);
  sections.push(`\n**PR:** [${context.pr_metadata.title}](${prUrl})`);
  sections.push(`**Author:** ${context.pr_metadata.author.username}`);
  sections.push(`**Branch:** ${context.pr_metadata.source_branch} → ${context.pr_metadata.target_branch}`);
  sections.push(`**Status:** ${context.pr_metadata.status}`);
  sections.push(`**Created at:** ${new Date(context.pr_metadata.created_at).toLocaleString()}`);
  if (context.pr_metadata.description) {
    sections.push(`\n## PR Description / Intentions`);
    sections.push(context.pr_metadata.description);
  }
  // Summarize intentions and logic from comments (TODO: advanced summarization)
  if (context.unresolved_review_threads.length > 0) {
    sections.push(`\n## Reviewer Comments (Intentions, Issues, Suggestions)`);
    context.unresolved_review_threads.forEach((thread) => {
      sections.push(`- File: ${thread.path || "unknown"}`);
      sections.push(`  - Comment: ${thread.body || ""}`);
    });
  }
  // List all changed files
  if (context.changed_files.length > 0) {
    sections.push(`\n## Changed Files`);
    context.changed_files.forEach((file) => {
      sections.push(`- ${file}`);
    });
  }
  // Include diffs for files with blockers
  if (context.file_diffs_with_blockers.length > 0) {
    sections.push(`\n## Diffs for Files with Unresolved Comments`);
    context.file_diffs_with_blockers.forEach((file) => {
      sections.push(`### ${file.filename}`);
      sections.push("```diff");
      sections.push(file.diff);
      sections.push("```");
    });
  }
  // Rebuild plan/checklist (TODO: advanced extraction)
  sections.push(`\n## Rebuild Checklist & Plan`);
  sections.push(`- [ ] Review all intentions and logic from PR description and comments.`);
  sections.push(`- [ ] Identify salvageable code and document what should be reused.`);
  sections.push(`- [ ] List any known issues or blockers from comments and diffs.`);
  sections.push(`- [ ] Create a new branch and port over the best parts of this PR.`);
  sections.push(`- [ ] Re-implement or refactor as needed, using this report as a guide.`);
  sections.push(`- [ ] Ensure all quality checks (linter, tests, etc.) pass on the new branch.`);
  sections.push(`- [ ] Document any additional context or decisions made during the rebuild.`);
  sections.push(`\n---\n`);
  sections.push(`**Note:** This plan is a starting point. For a more detailed extraction of intentions and logic, consider using advanced AI summarization or manual review of the PR and its comments.`);
  return sections.join("\n");
} 