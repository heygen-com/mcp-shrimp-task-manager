Fetch comprehensive GitHub PR context including metadata, changed files, unresolved review comments, merge blockers, and generate both JSON and markdown outputs.

This tool fetches all actionable and contextual information from a GitHub Pull Request URL, including:
- PR metadata (title, description, author, branches, status)
- List of all changed files
- File diffs for files with unresolved review comments
- Unresolved review threads only
- Required status checks that block merging
- Reviewer statuses

The tool outputs a detailed markdown summary and includes the structured JSON data in the ephemeral response. It does not provide recommendations or attempt to interpret the data - just presents raw context.

Requires a valid GitHub PR URL. For private repositories, ensure GITHUB_TOKEN environment variable is set with appropriate permissions. 