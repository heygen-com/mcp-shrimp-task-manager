# Architecture Snapshot Tool Design

## Overview

The Architecture Snapshot Tool is designed to automatically generate comprehensive documentation of a codebase's structure, dependencies, and organization. It creates versioned snapshots that track how the architecture evolves over time, making it easier for AI agents and developers to understand and work with any codebase.

## Core Objectives

1. **Automated Discovery**: Crawl and analyze codebases to extract architectural information
2. **Standardized Output**: Generate consistent documentation across different projects
3. **Change Tracking**: Compare snapshots to identify architectural evolution
4. **AI-Optimized**: Provide context that helps AI agents write better code
5. **Multi-Language Support**: Work with various programming languages and frameworks

## Key Information to Capture

### 1. Project Metadata
- **Basic Info**: Name, version, description, repository URL
- **Technology Stack**: Languages, frameworks, runtime versions
- **Dependencies**: Direct and transitive dependencies with versions
- **Build System**: Build tools, scripts, and configuration
- **Development Tools**: Linters, formatters, testing frameworks

### 2. Directory Structure
- **Hierarchical Tree**: Complete directory structure with annotations
- **Purpose Mapping**: What each major directory contains
- **File Counts**: Number of files by type in each directory
- **Size Metrics**: Directory sizes and file distributions
- **Naming Conventions**: Detected patterns in file/folder naming

### 3. Code Organization
- **Entry Points**: Main files, index files, application bootstrapping
- **Module Structure**: How code is organized into modules/packages
- **Layer Architecture**: Detected architectural layers (MVC, Clean Architecture, etc.)
- **Component Relationships**: How different parts interact
- **Public APIs**: Exported functions, classes, and interfaces

### 4. Configuration Analysis
- **Environment Variables**: Required and optional env vars
- **Configuration Files**: All config files with their purposes
- **Feature Flags**: Detected feature toggles
- **Build Configurations**: Development, staging, production settings
- **Security Configurations**: Authentication, CORS, security headers

### 5. Dependency Analysis
- **Direct Dependencies**: Packages directly used by the project
- **Dependency Tree**: Full dependency graph with versions
- **Vulnerability Status**: Known security issues in dependencies
- **Update Status**: Which dependencies are outdated
- **License Information**: License compatibility analysis

### 6. Code Patterns
- **Design Patterns**: Detected patterns (Singleton, Factory, Observer, etc.)
- **Coding Standards**: Detected style guides and conventions
- **Common Utilities**: Frequently used helper functions
- **Error Handling**: How errors are managed across the codebase
- **Logging Strategy**: Logging frameworks and patterns

### 7. API Surface
- **REST Endpoints**: All HTTP endpoints with methods and paths
- **GraphQL Schema**: Complete schema if applicable
- **WebSocket Events**: Real-time communication interfaces
- **CLI Commands**: Command-line interfaces
- **SDK Methods**: Public methods for libraries

### 8. Database Schema
- **Tables/Collections**: Database structure
- **Relationships**: Foreign keys and references
- **Indexes**: Performance optimizations
- **Migrations**: Database version history
- **Seed Data**: Initial data requirements

### 9. Testing Infrastructure
- **Test Organization**: How tests are structured
- **Coverage Metrics**: Code coverage percentages
- **Test Types**: Unit, integration, e2e tests
- **Testing Tools**: Frameworks and utilities
- **CI/CD Integration**: How tests run in pipelines

### 10. Documentation
- **README Files**: Main documentation files
- **API Documentation**: Generated or manual API docs
- **Code Comments**: Comment density and quality metrics
- **Documentation Tools**: JSDoc, Swagger, etc.
- **Examples**: Code examples and tutorials

## Implementation Architecture

### Tool Structure
```
architecture-snapshot/
├── src/
│   ├── analyzers/           # Language-specific analyzers
│   │   ├── javascript/
│   │   ├── typescript/
│   │   ├── python/
│   │   ├── java/
│   │   └── generic/
│   ├── collectors/          # Information collectors
│   │   ├── fileSystem.ts
│   │   ├── dependencies.ts
│   │   ├── configuration.ts
│   │   ├── codePatterns.ts
│   │   └── documentation.ts
│   ├── generators/          # Report generators
│   │   ├── markdown.ts
│   │   ├── json.ts
│   │   └── comparison.ts
│   ├── models/             # Data models
│   │   ├── snapshot.ts
│   │   └── comparison.ts
│   └── utils/              # Utilities
│       ├── cache.ts
│       └── fileUtils.ts
└── templates/              # Output templates
```

### Core Components

#### 1. Project Analyzer
```typescript
interface ProjectAnalyzer {
  analyze(projectPath: string): Promise<ProjectSnapshot>;
  detectLanguages(projectPath: string): Language[];
  detectFrameworks(projectPath: string): Framework[];
}
```

#### 2. Snapshot Model
```typescript
interface ProjectSnapshot {
  id: string;
  timestamp: Date;
  projectPath: string;
  metadata: ProjectMetadata;
  structure: DirectoryStructure;
  dependencies: DependencyGraph;
  configuration: ConfigurationMap;
  codePatterns: CodePatterns;
  apiSurface: APISurface;
  testing: TestingInfo;
  documentation: DocumentationInfo;
  metrics: ProjectMetrics;
}
```

#### 3. Comparison Engine
```typescript
interface SnapshotComparison {
  previous: ProjectSnapshot;
  current: ProjectSnapshot;
  changes: {
    added: ChangeSet;
    modified: ChangeSet;
    removed: ChangeSet;
  };
  impact: ImpactAnalysis;
}
```

## Output Formats

### 1. Markdown Report
A comprehensive, human-readable report with:
- Executive summary
- Detailed sections for each analysis area
- Visual diagrams (Mermaid)
- Change highlights (if comparing)

### 2. JSON Schema
Machine-readable format for:
- Integration with other tools
- API consumption
- Database storage
- Programmatic analysis

### 3. Interactive HTML
- Searchable documentation
- Collapsible sections
- Dependency graphs
- File browser

## Usage Workflow

### 1. Initial Snapshot
```bash
# Create first snapshot
architecture-snapshot create --project /path/to/project --output ./snapshots/

# Generates:
# - snapshots/2024-01-15-initial/
#   ├── architecture.md
#   ├── snapshot.json
#   └── assets/
```

### 2. Update Snapshot
```bash
# Create new snapshot and compare
architecture-snapshot update --project /path/to/project --previous ./snapshots/2024-01-15-initial/

# Generates:
# - snapshots/2024-01-20-update/
#   ├── architecture.md
#   ├── snapshot.json
#   ├── comparison.md
#   └── assets/
```

### 3. Integration with Shrimp
```typescript
// New tool: architecture_snapshot
{
  action: "create" | "update" | "compare",
  projectPath: string,
  previousSnapshot?: string,
  options: {
    depth: "shallow" | "deep",
    includeNodeModules: boolean,
    analyzers: string[],
    outputFormat: "markdown" | "json" | "html"
  }
}
```

## Key Features for AI Agents

### 1. Context Sections
Special sections optimized for AI consumption:
- **Quick Start**: How to run the project
- **Common Tasks**: Frequent development tasks
- **Architecture Decisions**: Why things are structured this way
- **Contribution Guide**: How to add new features
- **Gotchas**: Common pitfalls and their solutions

### 2. Code Examples
- **Pattern Examples**: How to implement common patterns
- **API Usage**: How to use key APIs
- **Testing Examples**: How to write tests
- **Configuration Examples**: How to configure features

### 3. Relationship Maps
- **Import Graphs**: What imports what
- **Call Graphs**: Function call relationships
- **Data Flow**: How data moves through the system
- **Event Flow**: Event emitters and listeners

## Performance Considerations

### 1. Incremental Analysis
- Cache unchanged file analysis
- Use file hashes for change detection
- Parallel processing for large codebases

### 2. Configurable Depth
- Quick scan: Basic structure and metadata
- Standard scan: Full analysis without node_modules
- Deep scan: Complete analysis including dependencies

### 3. Memory Management
- Stream processing for large files
- Chunked analysis for massive codebases
- Configurable memory limits

## Integration Points

### 1. CI/CD Pipeline
```yaml
# Example GitHub Action
- name: Update Architecture Snapshot
  uses: heygen/architecture-snapshot@v1
  with:
    compare-to: 'main'
    upload-artifact: true
```

### 2. Git Hooks
```bash
# Pre-commit hook to update snapshot
#!/bin/bash
if [ -f "architecture-snapshot.json" ]; then
  architecture-snapshot update --quick
fi
```

### 3. IDE Integration
- VS Code extension for viewing snapshots
- Real-time architecture updates
- Quick navigation from docs to code

## Success Metrics

1. **Completeness**: Captures 95%+ of architectural decisions
2. **Accuracy**: Correctly identifies patterns and relationships
3. **Performance**: Analyzes average project in < 5 minutes
4. **Usefulness**: AI agents successfully use docs to understand codebases
5. **Maintenance**: Snapshots stay current with minimal effort

## Future Enhancements

1. **AI-Powered Insights**: Use LLMs to generate architectural insights
2. **Cross-Project Analysis**: Compare architectures across projects
3. **Best Practice Scoring**: Rate architecture against best practices
4. **Refactoring Suggestions**: Identify improvement opportunities
5. **Team Knowledge Base**: Aggregate snapshots into organizational knowledge 