# GitHub PR Context Tool

## Overview

The `github_pr_context` tool fetches comprehensive context information from a GitHub Pull Request URL. It provides all actionable and contextual information an agent would need to understand and work with the PR, without providing recommendations or interpretations.

## Features

- **PR Metadata**: Title, description, author, branches, status, creation date
- **Changed Files**: Complete list of all files modified in the PR
- **Unresolved Review Comments**: Only unresolved review threads with full conversation history
- **File Diffs**: Full diffs for files that have unresolved review comments
- **Merge Blockers**: Required status checks that prevent merging
- **Reviewer Status**: Current status of all reviewers (approved, changes requested, etc.)

## Usage

```javascript
{
  "tool": "github_pr_context",
  "arguments": {
    "prUrl": "https://github.com/owner/repo/pull/123"
  }
}
```

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prUrl` | string | Yes | GitHub Pull Request URL (e.g., `https://github.com/owner/repo/pull/123`) |

## Output

The tool provides two types of output:

### 1. Markdown Summary (Primary Output)

A human-readable markdown summary that includes:
- PR metadata with links
- Required checks status with visual indicators (✅ ❌ ⏳)
- Reviewer statuses with visual indicators (🟢 🔴 💬)
- Unresolved review threads organized by file
- Complete list of changed files
- File diffs for files with unresolved comments

### 2. Structured JSON Data (Ephemeral)

Available in the `ephemeral.json_data` field:

```json
{
  "pr_metadata": {
    "title": "PR Title",
    "description": "PR description/body",
    "created_at": "2024-01-01T00:00:00Z",
    "status": "open",
    "source_branch": "feature-branch",
    "target_branch": "main",
    "pr_number": 123,
    "pr_url": "https://github.com/owner/repo/pull/123",
    "author": {
      "username": "author-username",
      "profile_url": "https://github.com/author-username"
    }
  },
  "changed_files": [
    "src/file1.js",
    "src/file2.ts"
  ],
  "file_diffs_with_blockers": [
    {
      "filename": "src/file1.js",
      "diff": "diff content..."
    }
  ],
  "unresolved_review_threads": [
    {
      "thread_id": "12345",
      "isResolved": false,
      "comments": [
        {
          "author": "reviewer",
          "profile_url": "https://github.com/reviewer",
          "timestamp": "2024-01-01T00:00:00Z",
          "body": "Please fix this issue",
          "file": "src/file1.js",
          "line": 42
        }
      ]
    }
  ],
  "required_checks": [
    {
      "name": "ci/test",
      "status": "failure",
      "details_url": "https://..."
    }
  ],
  "reviewers_status": [
    {
      "username": "reviewer1",
      "profile_url": "https://github.com/reviewer1",
      "status": "APPROVED"
    }
  ]
}
```

## Authentication

### Public Repositories
The tool works with public repositories without authentication, but you may hit GitHub's rate limits (60 requests per hour).

### Private Repositories
For private repositories or to increase rate limits, set the `GITHUB_TOKEN` environment variable:

```bash
export GITHUB_TOKEN=your_github_personal_access_token
```

The token needs the `repo` scope for private repositories.

## Error Handling

The tool handles various error scenarios:
- **Invalid URL**: Returns error if the URL is not a valid GitHub PR URL
- **Authentication Failed**: Indicates if the token is invalid
- **Rate Limit Exceeded**: Suggests setting a GitHub token
- **Access Forbidden**: Indicates if the repository is private and token lacks permissions
- **Not Found**: PR doesn't exist or user lacks access

## Example Usage

### Basic Usage
```javascript
const result = await github_pr_context({
  prUrl: "https://github.com/facebook/react/pull/28000"
});

console.log(result.content[0].text); // Markdown summary
console.log(result.ephemeral.json_data); // Structured data
```

### Testing with Command Line
```bash
# Test with any PR URL
node test-github-pr-tool.js https://github.com/facebook/react/pull/28000

# Test with a private repository (requires valid GITHUB_TOKEN in .env)
node test-github-pr-tool.js https://github.com/yourorg/private-repo/pull/123
```

### Error Example
```javascript
const result = await github_pr_context({
  prUrl: "https://github.com/private/repo/pull/123"
});
// Error: GitHub API access forbidden. This might be a private repository - ensure GITHUB_TOKEN has 'repo' scope.
```

## Important Notes

1. **No Recommendations**: The tool only provides raw data without interpretations or recommendations
2. **Unresolved Only**: Only unresolved review threads are included
3. **Required Checks**: Only checks that block merging are included (simplified - actual branch protection rules would be needed for full accuracy)
4. **Rate Limits**: Be aware of GitHub's API rate limits, especially without authentication
5. **Large PRs**: The tool fetches all data without pagination, so very large PRs might take longer

## Comparison with `analyze_pr` Tool

While both tools work with PRs, they serve different purposes:

| Feature | `github_pr_context` | `analyze_pr` |
|---------|-------------------|--------------|
| Purpose | Raw context dump | Analysis and recommendations |
| Recommendations | No | Yes |
| Quality Assessment | No | Yes |
| Issue Identification | No | Yes |
| Unresolved Comments Only | Yes | No |
| Platforms | GitHub only | GitHub, GitLab, Bitbucket |
| Output | Raw data | Analysis report |

Use `github_pr_context` when you need raw PR data for the agent to process, and `analyze_pr` when you want an analyzed report with recommendations. 