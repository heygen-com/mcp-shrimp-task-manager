import { z } from "zod";
import axios from "axios";
import { extractRepoInfo, GitPlatform } from "../../utils/gitUtils.js";

// Schema for the GitHub PR Context tool
export const githubPRContextSchema = z.object({
  prUrl: z
    .string()
    .url()
    .describe("GitHub Pull Request URL (e.g., https://github.com/owner/repo/pull/123)"),
});

// Interfaces for PR data structures
interface PRMetadata {
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
}

interface ReviewComment {
  author: string;
  profile_url: string;
  timestamp: string;
  body: string;
  file?: string;
  line?: number;
}

interface ReviewThread {
  thread_id: string;
  isResolved: boolean;
  comments: ReviewComment[];
}

interface RequiredCheck {
  name: string;
  status: "success" | "failure" | "pending" | "neutral";
  details_url?: string;
}

interface ReviewerStatus {
  username: string;
  profile_url: string;
  status: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING" | "DISMISSED";
}

interface PRContextData {
  pr_metadata: PRMetadata;
  changed_files: string[];
  file_diffs_with_blockers: Array<{
    filename: string;
    diff: string;
  }>;
  unresolved_review_threads: ReviewThread[];
  required_checks: RequiredCheck[];
  reviewers_status: ReviewerStatus[];
}

// Helper function to make authenticated GitHub API requests
async function githubApiRequest(url: string, acceptHeader: string = "application/vnd.github.v3+json") {
  const headers: any = {
    "Accept": acceptHeader,
    "User-Agent": "MCP-Shrimp-Task-Manager",
  };

  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    if (error instanceof Error && 'response' in error) {
      const axiosError = error as any;
      const status = axiosError.response?.status;
      
      if (status === 401) {
        throw new Error(`GitHub API authentication failed. Please check your GITHUB_TOKEN is valid.`);
      } else if (status === 403) {
        const rateLimitRemaining = axiosError.response?.headers['x-ratelimit-remaining'];
        if (rateLimitRemaining === '0') {
          throw new Error(`GitHub API rate limit exceeded. Please set a valid GITHUB_TOKEN to increase limits.`);
        }
        throw new Error(`GitHub API access forbidden. This might be a private repository - ensure GITHUB_TOKEN has 'repo' scope.`);
      } else if (status === 404) {
        throw new Error(`Resource not found. Please check the PR URL is correct and you have access to the repository.`);
      }
      
      throw new Error(`GitHub API error (${status}): ${axiosError.response?.statusText || axiosError.message}`);
    }
    throw error;
  }
}

// Main function to fetch GitHub PR context
export async function githubPRContext({ prUrl }: z.infer<typeof githubPRContextSchema>) {
  try {
    // Extract repository information
    const repoInfo = extractRepoInfo(prUrl);
    if (!repoInfo || repoInfo.platform !== GitPlatform.GITHUB) {
      throw new Error("Invalid GitHub PR URL. Expected format: https://github.com/owner/repo/pull/123");
    }

    // Fetch PR data
    const prApiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${repoInfo.prNumber}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prData = await githubApiRequest(prApiUrl) as any;

    // Fetch PR files
    const filesApiUrl = `${prApiUrl}/files`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filesData = (await githubApiRequest(filesApiUrl)) as any[];

    // Fetch review comments
    const reviewCommentsApiUrl = `${prApiUrl}/comments`;
    const reviewCommentsData = await githubApiRequest(reviewCommentsApiUrl);

    // Fetch issue comments (top-level PR comments)
    const issueCommentsApiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${repoInfo.prNumber}/comments`;
    const issueCommentsData = await githubApiRequest(issueCommentsApiUrl);

    // Fetch reviews
    const reviewsApiUrl = `${prApiUrl}/reviews`;
    const reviewsData = await githubApiRequest(reviewsApiUrl);

    // Fetch status checks
    const statusApiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/commits/${prData.head.sha}/status`;
    const statusData = await githubApiRequest(statusApiUrl);

    // Fetch check runs (newer GitHub Actions checks)
    const checkRunsApiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/commits/${prData.head.sha}/check-runs`;
    const checkRunsData = await githubApiRequest(checkRunsApiUrl);

    // Process the data
    const contextData = processGitHubData(
      prData,
      filesData,
      reviewCommentsData as any[],
      issueCommentsData as any[],
      reviewsData as any[],
      statusData,
      checkRunsData,
      prUrl
    );

    // Generate outputs
    const jsonOutput = JSON.stringify(contextData, null, 2);
    const markdownOutput = generateMarkdownSummary(contextData);

    return {
      content: [
        {
          type: "text" as const,
          text: markdownOutput,
        },
      ],
      ephemeral: {
        json_data: contextData,
        raw_json: jsonOutput,
      },
    };
  } catch (error: unknown) {
    console.error("Error in githubPRContext tool:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching PR context.";
    return {
      content: [
        {
          type: "text" as const,
          text: `Error fetching GitHub PR context: ${errorMessage}`,
        },
      ],
    };
  }
}

// Process GitHub API data into our structured format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processGitHubData(
  prData: any,
  filesData: any[],
  reviewCommentsData: any[],
  issueCommentsData: any[],
  reviewsData: any[],
  statusData: any,
  checkRunsData: any,
  prUrl: string
): PRContextData {
  // Extract PR metadata
  const pr_metadata: PRMetadata = {
    title: prData.title,
    description: prData.body || "",
    created_at: prData.created_at,
    status: prData.state,
    source_branch: prData.head.ref,
    target_branch: prData.base.ref,
    pr_number: prData.number,
    pr_url: prUrl,
    author: {
      username: prData.user.login,
      profile_url: prData.user.html_url,
    },
  };

  // Extract changed files
  const changed_files = filesData.map(file => file.filename);

  // Process review comments into threads
  const reviewThreads = processReviewThreads(reviewCommentsData);
  
  // Filter only unresolved threads
  const unresolved_review_threads = reviewThreads.filter(thread => !thread.isResolved);

  // Find files with unresolved comments
  const filesWithBlockers = new Set<string>();
  unresolved_review_threads.forEach(thread => {
    thread.comments.forEach(comment => {
      if (comment.file) {
        filesWithBlockers.add(comment.file);
      }
    });
  });

  // Get diffs for files with blockers
  const file_diffs_with_blockers = filesData
    .filter(file => filesWithBlockers.has(file.filename))
    .map(file => ({
      filename: file.filename,
      diff: file.patch || "",
    }));

  // Process required checks
  const required_checks = processRequiredChecks(statusData, checkRunsData);

  // Process reviewer statuses
  const reviewers_status = processReviewerStatuses(reviewsData);

  return {
    pr_metadata,
    changed_files,
    file_diffs_with_blockers,
    unresolved_review_threads,
    required_checks,
    reviewers_status,
  };
}

// Process review comments into threads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processReviewThreads(reviewCommentsData: any[]): ReviewThread[] {
  const threadsMap = new Map<string, ReviewThread>();

  reviewCommentsData.forEach(comment => {
    const threadId = comment.in_reply_to_id ? comment.in_reply_to_id.toString() : comment.id.toString();
    
    if (!threadsMap.has(threadId)) {
      threadsMap.set(threadId, {
        thread_id: threadId,
        isResolved: false,
        comments: [],
      });
    }

    const thread = threadsMap.get(threadId)!;
    
    // Check if thread is resolved
    if (comment.position === null && comment.line === null) {
      thread.isResolved = true;
    }

    thread.comments.push({
      author: comment.user.login,
      profile_url: comment.user.html_url,
      timestamp: comment.created_at,
      body: comment.body,
      file: comment.path,
      line: comment.line || comment.original_line,
    });
  });

  return Array.from(threadsMap.values());
}

// Process required checks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processRequiredChecks(statusData: any, checkRunsData: any): RequiredCheck[] {
  const checks: RequiredCheck[] = [];

  // Process commit statuses (older CI systems)
  if (statusData.statuses) {
    statusData.statuses.forEach((status: any) => {
      // Only include if it's a required context (this is a simplification - in reality, 
      // we'd need to check branch protection rules)
      if (status.context) {
        checks.push({
          name: status.context,
          status: mapStatusState(status.state),
          details_url: status.target_url,
        });
      }
    });
  }

  // Process check runs (GitHub Actions and newer integrations)
  if (checkRunsData.check_runs) {
    checkRunsData.check_runs.forEach((checkRun: any) => {
      // Only include required checks (again, simplified - would need branch protection info)
      if (checkRun.name) {
        checks.push({
          name: checkRun.name,
          status: mapCheckRunStatus(checkRun.status, checkRun.conclusion),
          details_url: checkRun.html_url,
        });
      }
    });
  }

  return checks;
}

// Map GitHub status states to our format
function mapStatusState(state: string): "success" | "failure" | "pending" | "neutral" {
  switch (state) {
    case "success":
      return "success";
    case "failure":
    case "error":
      return "failure";
    case "pending":
      return "pending";
    default:
      return "neutral";
  }
}

// Map GitHub check run status/conclusion to our format
function mapCheckRunStatus(status: string, conclusion: string | null): "success" | "failure" | "pending" | "neutral" {
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return "success";
      case "failure":
      case "timed_out":
      case "cancelled":
        return "failure";
      case "neutral":
      case "skipped":
        return "neutral";
      default:
        return "neutral";
    }
  }
  return "pending";
}

// Process reviewer statuses
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processReviewerStatuses(reviewsData: any[]): ReviewerStatus[] {
  // Temporary interface for storing reviewer data with timestamp
  interface ReviewerWithTimestamp extends ReviewerStatus {
    timestamp: string;
  }
  
  const reviewerMap = new Map<string, ReviewerWithTimestamp>();

  reviewsData.forEach(review => {
    const username = review.user.login;
    
    // Keep only the most recent review from each reviewer
    if (!reviewerMap.has(username) || new Date(review.submitted_at) > new Date(reviewerMap.get(username)!.timestamp)) {
      reviewerMap.set(username, {
        username: username,
        profile_url: review.user.html_url,
        status: mapReviewState(review.state),
        timestamp: review.submitted_at,
      });
    }
  });

  // Remove timestamp and return array
  return Array.from(reviewerMap.values()).map(({ timestamp, ...reviewer }) => reviewer);
}

// Map GitHub review states to our format
function mapReviewState(state: string): "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING" | "DISMISSED" {
  switch (state.toUpperCase()) {
    case "APPROVED":
      return "APPROVED";
    case "CHANGES_REQUESTED":
      return "CHANGES_REQUESTED";
    case "COMMENTED":
      return "COMMENTED";
    case "DISMISSED":
      return "DISMISSED";
    case "PENDING":
    default:
      return "PENDING";
  }
}

// Generate markdown summary
function generateMarkdownSummary(data: PRContextData): string {
  const { pr_metadata, changed_files, file_diffs_with_blockers, unresolved_review_threads, required_checks, reviewers_status } = data;

  let markdown = `# GitHub PR Context Summary\n\n`;
  
  // PR Metadata
  markdown += `## PR: [${pr_metadata.title}](${pr_metadata.pr_url})\n`;
  markdown += `- **Author:** [${pr_metadata.author.username}](${pr_metadata.author.profile_url})\n`;
  markdown += `- **Status:** ${pr_metadata.status}\n`;
  markdown += `- **Source branch:** ${pr_metadata.source_branch}\n`;
  markdown += `- **Target branch:** ${pr_metadata.target_branch}\n`;
  markdown += `- **Created at:** ${new Date(pr_metadata.created_at).toLocaleString()}\n\n`;

  if (pr_metadata.description) {
    markdown += `### Description\n${pr_metadata.description}\n\n`;
  }

  markdown += `---\n\n`;

  // Required Checks
  if (required_checks.length > 0) {
    markdown += `## Required Checks (Merge Blockers)\n`;
    required_checks.forEach(check => {
      const statusIcon = check.status === "success" ? "✅" : 
                        check.status === "failure" ? "❌" : 
                        check.status === "pending" ? "⏳" : "➖";
      markdown += `- **${check.name}:** ${statusIcon} ${check.status}`;
      if (check.details_url) {
        markdown += ` ([details](${check.details_url}))`;
      }
      markdown += `\n`;
    });
    markdown += `\n---\n\n`;
  }

  // Reviewers
  if (reviewers_status.length > 0) {
    markdown += `## Reviewers\n`;
    reviewers_status.forEach(reviewer => {
      const statusIcon = reviewer.status === "APPROVED" ? "🟢" :
                        reviewer.status === "CHANGES_REQUESTED" ? "🔴" :
                        reviewer.status === "COMMENTED" ? "💬" :
                        reviewer.status === "DISMISSED" ? "⚫" : "🟡";
      markdown += `- [@${reviewer.username}](${reviewer.profile_url}): ${statusIcon} ${reviewer.status.replace(/_/g, " ")}\n`;
    });
    markdown += `\n---\n\n`;
  }

  // Unresolved Review Threads
  if (unresolved_review_threads.length > 0) {
    markdown += `## Unresolved Review Threads\n`;
    unresolved_review_threads.forEach(thread => {
      const firstComment = thread.comments[0];
      if (firstComment.file) {
        markdown += `### File: ${firstComment.file}\n`;
        if (firstComment.line) {
          markdown += `- **Line ${firstComment.line}:**\n`;
        }
      }
      
      thread.comments.forEach(comment => {
        markdown += `  - [@${comment.author}](${comment.profile_url}) at ${new Date(comment.timestamp).toLocaleString()}:\n`;
        markdown += `    > ${comment.body.split('\n').join('\n    > ')}\n\n`;
      });
    });
    markdown += `---\n\n`;
  }

  // Changed Files
  markdown += `## Changed Files\n`;
  changed_files.forEach(file => {
    markdown += `- ${file}\n`;
  });
  markdown += `\n`;

  // File Diffs with Blockers
  if (file_diffs_with_blockers.length > 0) {
    markdown += `---\n\n## Diffs for Files with Unresolved Comments\n`;
    file_diffs_with_blockers.forEach(file => {
      markdown += `### ${file.filename}\n`;
      markdown += "```diff\n";
      markdown += file.diff;
      markdown += "\n```\n\n";
    });
  }

  // Note for agent
  markdown += `---\n\n`;
  markdown += `**Note:**\n`;
  markdown += `This is a raw context dump. If you are unsure how to proceed or need help interpreting any blockers or comments, please consult an expert for advice.\n`;

  return markdown;
} 