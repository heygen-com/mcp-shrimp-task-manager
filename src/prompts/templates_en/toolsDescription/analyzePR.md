Analyze a pull request from GitHub, GitLab, or Bitbucket and generate a comprehensive markdown report.

This tool fetches PR data and diffs, analyzes code changes, identifies potential issues, and provides quality assessments with recommendations. The generated report includes:

- Summary with quality score
- File-by-file analysis with diffs
- Identified issues categorized by severity
- Code quality assessments per file
- Recommendations and risk analysis

Reports are automatically saved to the `DATA_DIR/reports` directory with a timestamp and PR information in the filename. A companion JSON metadata file is also created for each report.

The report is structured to help track feature development across multiple PRs and can be used as context for progressive feature building.

Requires a valid PR URL from supported platforms (GitHub, GitLab, Bitbucket). For private repositories, set appropriate API tokens as environment variables (e.g., GITHUB_TOKEN). 