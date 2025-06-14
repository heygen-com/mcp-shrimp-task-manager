[English](CHANGELOG.md) | [中文](docs/zh/CHANGELOG.md)

# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added
- **GitHub PR Context Tool**: New tool to fetch comprehensive GitHub PR context
  - Fetches PR metadata, changed files, unresolved review comments, and merge blockers
  - Outputs both structured JSON and human-readable markdown
  - Supports authentication for private repositories via GITHUB_TOKEN
  - Provides raw data without recommendations or interpretations
  - Complements the existing `analyze_pr` tool by focusing on context rather than analysis
- JIRA comment task completion notes - When marking JIRA comment tasks as complete, agents can now include a `completionNote` parameter to document what was done. The note appears as a visually distinct panel in the JIRA comment.

## 1.0.14 - 2025-05-24

### Added
- **Translation Memory Caching**: Translation tool now checks memory cache first before calling OpenAI
  - Exact matches with high confidence (≥95%) are returned immediately
  - Reduces API calls and response time from 4-6s to <10ms for cached translations
  - Updates usage counts for better tracking

- **Consolidate Translation Memory Tool**: New tool to optimize translation storage
  - Extracts translations from all dialog files
  - Removes duplicates while keeping highest confidence versions
  - Merges with existing memory and updates usage counts
  - Optional cleanup of processed dialog files
  - Provides detailed consolidation reports and statistics

### Fixed
- Fixed date serialization issue in translation memory causing "getTime is not a function" errors
- Translation tool now properly revives Date objects when loading from JSON

### Improved
- Significantly improved translation performance for repeated content
- Better memory management by consolidating duplicate translations
- More efficient storage by removing unnecessary dialog files

## 1.0.13

### Fixed

- Fix: Corrected issue with invariantlabs misjudgment (148f0cd)

## 1.0.12

### Added

- Added demonstration video links to README and Chinese README, along with demonstration video image files. (406eb46)
- Added JSON format notes emphasizing the prohibition of comments and the requirement for special character escaping to prevent parsing failures. (a328322)
- Added a web-based graphical interface feature, controlled by the `ENABLE_GUI` environment variable. (bf5f367)

### Removed

- Removed unnecessary error log outputs in multiple places to avoid Cursor errors. (552eed8)

## 1.0.11

### Changed

- Removed unused functions. (f8d9c8)

### Fixed

- Fix: Resolved issue with Chinese character support in Cursor Console. (00943e1)

## 1.0.10

### Changed

- Added guidelines for project rule update modes, emphasizing recursive checks and autonomous handling of ambiguous requests. (989af20)
- Added prompt language and customization instructions, updated README and docs. (d0c3bfa)
- Added `TEMPLATES_USE` config option for custom prompt templates, updated README and docs. (76315fe)
- Added multilingual task templates (English/Chinese). (291c5ee)
- Added prompt generators and templates for various task operations (delete, clear, update). (a51110f, 52994d5, 304e0cd)
- Changed task templates to Markdown format for better multilingual support and modification. (5513235)
- Adjusted the "batch submission" parameter limit for the `split_tasks` tool from 8000 to 5000 characters. (a395686)
- Removed the unused tool for updating task-related files. (fc1a5c8)
- Updated README and docs: added 'Recommended Models', linked MIT license, added Star History, added TOC and tags, enhanced usage guides. (5c61b3e, f0283ff, 0bad188, 31065fa)
- Updated task content description: allow completed tasks to update related file summaries, adjusted thought process description. (b07672c)
- Updated task templates: added 'Please strictly follow the instructions below' prompt, enhanced guidance. (f0283ff)

### Fixed

- Fixed an issue where some models might not follow the process correctly. (ffd6349)
- Fix #6: Corrected an issue where simplified/traditional Chinese caused Enum parameter validation errors. (dae3756)

## 1.0.8

### Added

- Added dependency on zod-to-json-schema for better schema integration
- Added detailed task splitting guidelines for better task management
- Added more robust error handling for Agent tool calls

### Changed

- Updated MCP SDK integration for better error handling and compatibility
- Improved task implementation prompt templates for clearer instructions
- Optimized task split tool descriptions and parameter validation

### Fixed

- Fixed issue #5 where some Agents couldn't properly handle errors
- Fixed line formatting in template documents for better readability

## 1.0.7

### Added

- Added Thought Chain Process feature for systematic problem analysis
- Added Project Rules Initialization feature for maintaining project consistency

### Changed

- Updated documentation to emphasize systematic problem analysis and project consistency
- Adjusted tool list to include new features
- Updated .gitignore to exclude unnecessary folders
