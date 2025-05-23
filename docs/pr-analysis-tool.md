# PR Analysis Tool Documentation

The `analyze_pr` tool provides comprehensive analysis of pull requests from GitHub, GitLab, and Bitbucket. It generates structured markdown reports that can be used to track feature development across multiple PRs.

## Features

- **Multi-platform support**: GitHub, GitLab, and Bitbucket
- **Comprehensive analysis**: Code quality assessment, issue detection, and recommendations
- **Structured output**: Organized markdown report with sections for diff, comments, issues, and summary
- **Quality scoring**: Automatic quality score calculation (0-100)
- **Focus areas**: Optional targeting of specific concerns (security, performance, code style)
- **Line-by-line analysis**: Optional detailed analysis of code changes
- **Automatic report saving**: Reports are saved to `DATA_DIR/reports` with metadata

## Usage

### Basic Usage

```json
{
  "prUrl": "https://github.com/owner/repo/pull/123"
}
```

### Advanced Usage

```json
{
  "prUrl": "https://github.com/owner/repo/pull/123",
  "includeLineByLine": true,
  "focusAreas": ["security", "performance"]
}
```

## Authentication

For private repositories, set the appropriate environment variables:

- **GitHub**: `GITHUB_TOKEN`
- **GitLab**: `GITLAB_TOKEN` (not yet implemented)
- **Bitbucket**: `BITBUCKET_TOKEN` (not yet implemented)

## Output Structure

The tool generates a markdown report with the following sections:

### 1. Summary
- PR title, author, and branch information
- Overall quality score
- Key changes summary

### 2. File Changes
For each changed file:
- File status (added, modified, deleted)
- Quality assessment (excellent, good, needs-improvement, poor)
- Diff blocks with code changes
- Specific concerns and suggestions

### 3. Issues Found
Categorized by severity:
- **Critical**: Blocking issues that must be fixed
- **Major**: Significant problems that should be addressed
- **Minor**: Small issues that could be improved
- **Suggestion**: Recommendations for better practices

### 4. Recommendations & Risks
- General recommendations for improvement
- Identified risks and technical debt

## Report Storage

Reports are automatically saved to the `DATA_DIR/reports` directory with the following structure:

```
DATA_DIR/reports/
├── github-owner-repo-PR123-2024-01-15T10-30-45.md
├── github-owner-repo-PR123-2024-01-15T10-30-45.json
├── gitlab-group-project-PR456-2024-01-15T11-45-00.md
└── gitlab-group-project-PR456-2024-01-15T11-45-00.json
```

- **Markdown files (.md)**: The full analysis report
- **JSON files (.json)**: Metadata including PR details, quality score, and statistics

The reports directory is automatically created if it doesn't exist.

## Example Output

```markdown
# Pull Request Analysis Report

**PR:** [Add user authentication](https://github.com/example/repo/pull/123)
**Author:** john-doe
**Branch:** feature/auth → main
**Stats:** 5 files changed (+250 -50)

## Summary

This PR Add user authentication contains 5 file changes with 250 additions and 50 deletions.

**Quality Score:** 85/100

### Key Changes
- Added new file: src/auth/jwt.ts
- Major refactoring in: src/middleware/auth.ts

## File Changes

### src/auth/jwt.ts
**Status:** added | **Quality:** good
**Changes:** +120 -0

```diff
+import jwt from 'jsonwebtoken';
+
+export function generateToken(userId: string): string {
+  return jwt.sign({ userId }, process.env.JWT_SECRET, {
+    expiresIn: '24h'
+  });
+}
```

**Suggestions:**
- 💡 Consider adding token refresh mechanism

...
```

## Integration with Task Management

The PR analysis tool can be used in conjunction with the task management system:

1. Analyze a PR to understand changes
2. Use the analysis to plan tasks for addressing issues
3. Track implementation of improvements across multiple PRs
4. Build a history of feature development

## Future Enhancements

- GitLab and Bitbucket implementation
- PR comment extraction and analysis
- Integration with CI/CD status
- Historical PR analysis trends
- Automated task creation from PR issues 