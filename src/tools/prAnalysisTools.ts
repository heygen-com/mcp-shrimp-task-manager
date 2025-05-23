import { z } from "zod";
import axios from "axios";
import { extractRepoInfo, GitPlatform } from "../utils/gitUtils.js";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

// Schema for PR analysis tool
export const analyzePRSchema = z.object({
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

// Main PR analysis function
export async function analyzePR({
  prUrl,
  includeLineByLine = false,
  focusAreas = [],
}: z.infer<typeof analyzePRSchema>) {
  try {
    // Extract repository information from URL
    const repoInfo = extractRepoInfo(prUrl);
    if (!repoInfo) {
      throw new Error("Invalid PR URL. Supported platforms: GitHub, GitLab, Bitbucket");
    }

    // Fetch PR data based on platform
    let prData: any;
    let diffData: string;
    
    switch (repoInfo.platform) {
      case GitPlatform.GITHUB:
        prData = await fetchGitHubPR(repoInfo);
        diffData = await fetchGitHubDiff(repoInfo);
        break;
      case GitPlatform.GITLAB:
        prData = await fetchGitLabPR(repoInfo);
        diffData = await fetchGitLabDiff(repoInfo);
        break;
      case GitPlatform.BITBUCKET:
        prData = await fetchBitbucketPR(repoInfo);
        diffData = await fetchBitbucketDiff(repoInfo);
        break;
      default:
        throw new Error(`Unsupported platform: ${repoInfo.platform}`);
    }

    // Analyze the PR
    const analysis = await performAnalysis(prData, diffData, includeLineByLine, focusAreas);

    // Generate markdown report
    const report = generateMarkdownReport(analysis, prUrl);

    // Save report to file
    const savedFilePath = await saveReport(report, repoInfo, analysis);

    return {
      content: [
        {
          type: "text" as const,
          text: report,
        },
      ],
      ephemeral: {
        analysis: analysis,
        savedTo: savedFilePath,
      },
    };
  } catch (error: unknown) {
    console.error("Error in analyzePR tool:", error);
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
async function fetchGitHubPR(repoInfo: any): Promise<any> {
  const apiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${repoInfo.prNumber}`;
  
  try {
    const headers: any = {
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
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      
      if (status === 401) {
        throw new Error(`GitHub API authentication failed. Please check your GITHUB_TOKEN is valid.`);
      } else if (status === 403) {
        const rateLimitRemaining = error.response?.headers['x-ratelimit-remaining'];
        if (rateLimitRemaining === '0') {
          throw new Error(`GitHub API rate limit exceeded. Please set a valid GITHUB_TOKEN to increase limits.`);
        }
        throw new Error(`GitHub API access forbidden. This might be a private repository - ensure GITHUB_TOKEN has 'repo' scope.`);
      } else if (status === 404) {
        throw new Error(`Pull request not found. Please check the PR URL is correct and you have access to the repository.`);
      }
      
      throw new Error(`GitHub API error (${status}): ${statusText || error.message}`);
    }
    throw error;
  }
}

async function fetchGitHubDiff(repoInfo: any): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${repoInfo.prNumber}`;
  
  try {
    const headers: any = {
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
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401) {
        throw new Error(`GitHub API authentication failed while fetching diff.`);
      } else if (status === 403) {
        throw new Error(`GitHub API access forbidden while fetching diff.`);
      }
      throw new Error(`GitHub API error while fetching diff: ${error.response?.statusText || error.message}`);
    }
    throw error;
  }
}

// Placeholder functions for other platforms
async function fetchGitLabPR(repoInfo: any): Promise<any> {
  throw new Error("GitLab support not yet implemented");
}

async function fetchGitLabDiff(repoInfo: any): Promise<string> {
  throw new Error("GitLab support not yet implemented");
}

async function fetchBitbucketPR(repoInfo: any): Promise<any> {
  throw new Error("Bitbucket support not yet implemented");
}

async function fetchBitbucketDiff(repoInfo: any): Promise<string> {
  throw new Error("Bitbucket support not yet implemented");
}

// Analysis logic
async function performAnalysis(
  prData: any,
  diffData: string,
  includeLineByLine: boolean,
  focusAreas: string[]
): Promise<PRAnalysisResult> {
  // Parse diff data
  const files = parseDiff(diffData);

  // Analyze each file
  const fileAnalyses: FileAnalysis[] = files.map(file => analyzeFile(file, includeLineByLine, focusAreas));

  // Extract comments and issues
  const comments = extractComments(prData);
  const issues = identifyIssues(fileAnalyses, focusAreas);

  // Generate summary
  const summary = generateSummary(prData, fileAnalyses, issues);

  return {
    title: prData.title,
    description: prData.body || "",
    author: prData.user?.login || "Unknown",
    branch: {
      source: prData.head?.ref || "Unknown",
      target: prData.base?.ref || "Unknown",
    },
    stats: {
      filesChanged: prData.changed_files || files.length,
      additions: prData.additions || 0,
      deletions: prData.deletions || 0,
    },
    files: fileAnalyses,
    comments,
    issues,
    summary,
  };
}

// Diff parsing
function parseDiff(diffData: string): any[] {
  // Basic diff parsing - this is a simplified version
  const files: any[] = [];
  const lines = diffData.split("\n");
  let currentFile: any = null;

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
function analyzeFile(file: any, includeLineByLine: boolean, focusAreas: string[]): FileAnalysis {
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
function analyzeChunk(chunk: any, includeLineByLine: boolean): DiffBlock[] {
  // Simplified chunk analysis
  return [{
    startLine: chunk.newStart,
    endLine: chunk.newStart + chunk.newLines - 1,
    type: "modification" as const,
    content: chunk.lines.join("\n"),
    analysis: includeLineByLine ? "Line-by-line analysis would go here" : undefined,
  }];
}

function checkChunkIssues(chunk: any, focusAreas: string[]): { concerns: string[], suggestions: string[] } {
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

function determineFileStatus(file: any): "added" | "modified" | "deleted" | "renamed" {
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

function extractComments(prData: any): PRComment[] {
  // For now, return empty array - would need to fetch comments separately
  return [];
}

function identifyIssues(fileAnalyses: FileAnalysis[], focusAreas: string[]): PRIssue[] {
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

function generateSummary(prData: any, fileAnalyses: FileAnalysis[], issues: PRIssue[]): PRSummary {
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
    overview: `This PR ${prData.title} contains ${totalFiles} file changes with ${prData.additions} additions and ${prData.deletions} deletions.`,
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
async function saveReport(report: string, repoInfo: any, analysis: PRAnalysisResult): Promise<string> {
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
    const safeRepoName = repoInfo.repo.replace(/[^a-zA-Z0-9-_]/g, '-');
    const filename = `${repoInfo.platform}-${repoInfo.owner}-${safeRepoName}-PR${repoInfo.prNumber}-${timestamp}.md`;
    const filePath = path.join(reportsDir, filename);
    
    // Save the report
    await fs.writeFile(filePath, report, 'utf-8');
    
    // Also create a metadata file with the analysis data
    const metadataPath = filePath.replace('.md', '.json');
    const metadata = {
      prUrl: `${repoInfo.baseUrl}/${repoInfo.owner}/${repoInfo.repo}/pull/${repoInfo.prNumber}`,
      timestamp: new Date().toISOString(),
      platform: repoInfo.platform,
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      prNumber: repoInfo.prNumber,
      title: analysis.title,
      author: analysis.author,
      qualityScore: analysis.summary.qualityScore,
      filesChanged: analysis.stats.filesChanged,
      additions: analysis.stats.additions,
      deletions: analysis.stats.deletions,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    
    return filePath;
  } catch (error) {
    // Don't throw - just log the error and return empty string
    // This way the analysis still works even if saving fails
    return "";
  }
} 