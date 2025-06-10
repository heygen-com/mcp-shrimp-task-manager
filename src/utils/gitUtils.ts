/**
 * IMPORTANT: In the agent-driven workflow, these are helper/documentation functions only.
 * The agent is responsible for actually running all git commands locally, not the tool.
 * These functions only document what commands the agent should run and how to process their output.
 */

/**
 * Documents how to run a git command and capture its output.
 * This is a reference function for the agent, not to be executed directly by the tool.
 */
export async function runGitCommand(cmd: string, args: string[]): Promise<string> {
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

// Git platform types
export enum GitPlatform {
  GITHUB = "github",
  GITLAB = "gitlab",
  BITBUCKET = "bitbucket",
}

// Repository information interface
export interface RepoInfo {
  platform: GitPlatform;
  owner: string;
  repo: string;
  prNumber: string;
  baseUrl: string;
}

// Extract repository information from PR URL
export function extractRepoInfo(prUrl: string): RepoInfo | null {
  try {
    const url = new URL(prUrl);
    const hostname = url.hostname.toLowerCase();
    const pathParts = url.pathname.split("/").filter(part => part.length > 0);

    // GitHub PR URL format: https://github.com/owner/repo/pull/123
    if (hostname.includes("github.com")) {
      if (pathParts.length >= 4 && pathParts[2] === "pull") {
        return {
          platform: GitPlatform.GITHUB,
          owner: pathParts[0],
          repo: pathParts[1],
          prNumber: pathParts[3],
          baseUrl: "https://github.com",
        };
      }
    }

    // GitLab MR URL format: https://gitlab.com/owner/repo/-/merge_requests/123
    if (hostname.includes("gitlab.com") || hostname.includes("gitlab")) {
      const mrIndex = pathParts.indexOf("merge_requests");
      if (mrIndex > 0 && pathParts.length > mrIndex + 1) {
        // Handle nested groups/subgroups
        const repoPathEnd = pathParts.indexOf("-");
        const ownerParts = pathParts.slice(0, repoPathEnd - 1);
        const repo = pathParts[repoPathEnd - 1];
        
        return {
          platform: GitPlatform.GITLAB,
          owner: ownerParts.join("/"),
          repo: repo,
          prNumber: pathParts[mrIndex + 1],
          baseUrl: `https://${hostname}`,
        };
      }
    }

    // Bitbucket PR URL format: https://bitbucket.org/owner/repo/pull-requests/123
    if (hostname.includes("bitbucket.org")) {
      if (pathParts.length >= 4 && pathParts[2] === "pull-requests") {
        return {
          platform: GitPlatform.BITBUCKET,
          owner: pathParts[0],
          repo: pathParts[1],
          prNumber: pathParts[3],
          baseUrl: "https://bitbucket.org",
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Helper function to construct API URLs
export function getApiUrl(repoInfo: RepoInfo): string {
  switch (repoInfo.platform) {
    case GitPlatform.GITHUB:
      return `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`;
    case GitPlatform.GITLAB:
      return `${repoInfo.baseUrl}/api/v4/projects/${encodeURIComponent(`${repoInfo.owner}/${repoInfo.repo}`)}`;
    case GitPlatform.BITBUCKET:
      return `https://api.bitbucket.org/2.0/repositories/${repoInfo.owner}/${repoInfo.repo}`;
    default:
      throw new Error(`Unsupported platform: ${repoInfo.platform}`);
  }
} 