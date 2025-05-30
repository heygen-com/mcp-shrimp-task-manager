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
    *   **Your role is to REVIEW and PROVIDE FEEDBACK ONLY. Do NOT attempt to write code, modify files, run commands, or fix issues yourself.**
    *   From the file list, select a single file or a small group of related files to review in detail.
    *   For EACH changed file in the PR, you MUST provide a review block structured as follows:
        ```markdown
        ---
        ### path/to/your/file.ext
        *(Use the full project-relative path of the file here. Note: The agent typically cannot generate absolute `file://` links as it does not know the user's local file system structure.)*
        **GitHub Link:** [Construct direct link to the file on GitHub based on PR info and file path]
        **Status:** [LGTM | Needs Updates | Action Required | Needs Discussion]

        *(The "Comments:" section below should ONLY be included if Status is 'Needs Updates', 'Action Required', or 'Needs Discussion'. If Status is 'LGTM', omit the entire "Comments:" section for this file.)*
        **Comments:** 
        - Line XX: [Specific feedback/issue]
        - General: [Overall comment for this file if changes are needed]
        ---
        ```
    *   To populate the review block:
        *   Carefully read the diffs and code changes for the selected file(s).
        *   Determine the **Status**. If no issues, use "LGTM".
        *   If changes or discussion are needed (Status is 'Needs Updates', 'Action Required', or 'Needs Discussion'), populate the **Comments** section with:
            *   Specific, actionable feedback, referencing line numbers.
            *   Flag any issues: performance, security, code style, syntax, grammar, architecture, test coverage, and standards.
    *   Repeat this step until all relevant files have been reviewed and have a corresponding review block.

3.  **Summarize Your Review:**
    *   Compile all flagged issues (from files with Status 'Needs Updates', 'Action Required', or 'Needs Discussion') into a consolidated list.
    *   Provide an overall assessment (approve, request changes, or block).
    *   Outline clear next steps for the author.
    *   **Use `consult_expert` sparingly.** Only consider it if you encounter a critical ambiguity, a potential security vulnerability you cannot fully assess, or a blocker that truly prevents you from completing the review *after* you have thoroughly analyzed all provided PR data and diffs. Do not use it for simple clarifications that could be inferred from the code or PR description.

- Act as a senior engineering manager and code reviewer.
- Do not ask the user to do the review; you must do all the analysis and output the results.
- Output your entire review as a single markdown document. Start with individual file review blocks (as defined above), followed by the overall summary and recommendations section.

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