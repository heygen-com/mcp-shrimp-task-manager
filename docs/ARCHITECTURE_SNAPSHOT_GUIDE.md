# Architecture Snapshot Tool Guide

The Architecture Snapshot Tool automatically analyzes and documents your codebase structure, creating comprehensive documentation that helps AI agents and developers understand your project better.

## Overview

This tool creates detailed "snapshots" of your codebase architecture, including:
- Directory structure with purpose annotations
- Technology stack and frameworks
- Dependencies and their status
- Configuration files and environment variables
- Code organization patterns
- API surface documentation
- Testing infrastructure
- Metrics and statistics

## Usage

### Creating Your First Snapshot

To create an architecture snapshot of the current project:

```
architecture_snapshot action=create
```

To analyze a specific project:

```
architecture_snapshot action=create projectPath=/path/to/project
```

### Options

- **depth**: `shallow` or `deep` (default: deep)
  - `shallow`: Analyzes up to 3 directory levels
  - `deep`: Analyzes the entire project structure

- **includeNodeModules**: `true` or `false` (default: false)
  - Whether to include node_modules in the analysis

Example with options:
```
architecture_snapshot action=create options.depth=shallow options.includeNodeModules=false
```

### Updating Snapshots

To create a new snapshot and compare it with the previous one:

```
architecture_snapshot action=update projectId=my-project
```

This will:
1. Create a new snapshot
2. Compare it with the most recent snapshot
3. Generate a comparison report highlighting changes

### Listing Snapshots

To see all projects with snapshots:

```
architecture_snapshot action=list
```

To see snapshots for a specific project:

```
architecture_snapshot action=list projectId=my-project
```

## Output

Each snapshot generates:

### 1. Architecture Report (architecture.md)
A comprehensive markdown document containing:
- Executive summary with key statistics
- Project metadata and configuration
- Technology stack analysis
- Complete directory structure with annotations
- Dependency analysis with security warnings
- Configuration documentation
- Code organization patterns
- API documentation
- Testing infrastructure details
- Quick start guide
- Common tasks documentation
- Architecture decisions explanation

### 2. JSON Snapshot (architecture.json)
A machine-readable version containing all analyzed data for:
- Programmatic access
- Comparison between versions
- Integration with other tools

### 3. Comparison Report (comparison.md)
When updating, shows:
- What changed between snapshots
- New files and directories
- Dependency updates
- Configuration changes
- Structural modifications

## Storage Location

Snapshots are stored in:
```
<DATA_DIR>/architecture-snapshots/<project-id>/<timestamp>/
├── architecture.md      # Human-readable report
├── architecture.json    # Machine-readable data
└── comparison.md       # Changes from previous (if update)
```

## Best Practices

### 1. Regular Snapshots
Create snapshots:
- Before major refactoring
- After significant features
- As part of release process
- When onboarding new team members

### 2. Project IDs
Use consistent project IDs for tracking:
```
architecture_snapshot action=create projectId=my-app-frontend
```

### 3. Depth Selection
- Use `shallow` for quick overviews
- Use `deep` for comprehensive documentation

### 4. Version Control
Consider committing snapshots to version control for:
- Historical documentation
- Architecture decision records
- Onboarding materials

## Use Cases

### 1. AI Agent Context
Provide AI agents with comprehensive project understanding:
```
# Create snapshot
architecture_snapshot action=create

# AI can now reference the generated documentation
# to understand project structure and make better decisions
```

### 2. Project Onboarding
Generate documentation for new developers:
```
architecture_snapshot action=create projectPath=/path/to/project
```

### 3. Architecture Reviews
Track architectural changes over time:
```
# Initial snapshot
architecture_snapshot action=create projectId=my-app

# After refactoring
architecture_snapshot action=update projectId=my-app
```

### 4. Documentation Generation
Create up-to-date technical documentation:
```
architecture_snapshot action=create options.depth=deep
```

## Example Output

Here's what a typical architecture report includes:

```markdown
# Architecture Documentation: my-awesome-app

Generated on: 2024-01-15 10:30:00
Version: 1.0.0

## Executive Summary

**my-awesome-app** is a full-stack web application that provides user management and analytics.

### Key Statistics
- **Total Files**: 1,234
- **Total Directories**: 89
- **Dependencies**: 45 (2 outdated, 0 with vulnerabilities)
- **Test Coverage**: 87%
- **Primary Language**: TypeScript
- **Package Manager**: npm

## Directory Structure

```
my-awesome-app/
├── src/                    # Source code
│   ├── components/         # UI components
│   ├── services/          # Service layer
│   ├── models/            # Data models
│   └── utils/             # Utility functions
├── tests/                 # Test files
├── docs/                  # Documentation
└── config/                # Configuration files
```

... (continues with detailed analysis)
```

## Limitations

Current limitations (to be improved in future versions):
- Language detection is simplified
- Dependency vulnerability scanning requires npm audit
- Code complexity metrics are basic
- API endpoint detection is limited

## Future Enhancements

Planned improvements:
- AI-powered architectural insights
- Cross-project comparisons
- Best practice scoring
- Refactoring suggestions
- Integration with CI/CD pipelines 