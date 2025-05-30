Fetch and organize pull request data from GitHub, GitLab, or Bitbucket into a structured report.

---

# Agent Review Instructions (Engineering Manager)

**You have received the organized PR data from this tool.** Your task now is to perform a thorough code review.

**IMPORTANT: Do NOT call this `pull_request` tool again for the same PR URL unless you believe the PR has been updated and you need to refresh the data.**

Given that PRs can be large, follow this review process:

1.  **Understand the Context:**
    *   Read the PR title, description, author, branches, and overall stats.
    *   Review the list of changed files to get an overview.
    *   Examine any CI/test results and existing review comments.

2.  **Perform Detailed File Review (Iteratively):
    *   From the file list, select a single file or a small group of related files to review in detail.
    *   **For EACH changed file in the PR, you MUST provide a comment.** This comment should either:
        *   Contain specific feedback (issues, suggestions, questions).
        *   Or, if no issues are found, provide a brief acknowledgment (e.g., "Reviewed: LGTM", "No issues found, changes are clear.", "Minor stylistic nits only, see below.").
    *   Carefully read the diffs and code changes for the selected file(s).
    *   For every selected file and its changes, do a deep review:
        *   Flag any issues: performance, security, code style, syntax, grammar, architecture, test coverage, and standards.
        *   For each issue, generate a review comment with:
            *   File name (clearly stated)
            *   Line number(s) (if possible)
            *   Severity (blocker, warning, suggestion)
            *   Actionable feedback
    *   Repeat this step until all relevant files have been reviewed and commented on.

3.  **Summarize Your Review:**
    *   Compile all flagged issues from your file-by-file review.
    *   Provide an overall assessment (approve, request changes, or block).
    *   Outline clear next steps for the author.

- Act as a senior engineering manager and code reviewer.
- Do not ask the user to do the review; you must do all the analysis and output the results.
- Output your review in a structured markdown table (for file-specific comments), followed by a summary and recommendations.

---

This tool retrieves PR metadata, diffs, comments, review status, and CI/test results, organizing them into a clear format for analysis. The tool presents data based on the selected action:

- **review**: Organizes data for code review perspective (default)
- **fix**: Focuses on CI/test failures and reviewer comments for authors
- **rebuild**: Extracts full context for reconstructing the PR

The generated report includes:
- PR metadata (title, author, branches, description)
- File changes with diffs (if `includeLineByLine` is true)
- Review comments and status
- CI/test results and checks
- Organized context based on the selected action

Reports are automatically saved to the `DATA_DIR/reports` directory. The tool does not perform code analysis - it organizes data for the agent to analyze.

Requires a valid PR URL from supported platforms (GitHub, GitLab, Bitbucket). For private repositories, set appropriate API tokens as environment variables (e.g., GITHUB_TOKEN). 