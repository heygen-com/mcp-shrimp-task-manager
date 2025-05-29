import { ProjectSnapshot, DirectoryNode, ProjectMetadata } from '../../../types/architectureSnapshot.js';

export class MarkdownGenerator {
  generate(snapshot: ProjectSnapshot): string {
    const sections = [
      this.generateHeader(snapshot),
      this.generateTableOfContents(),
      this.generateExecutiveSummary(snapshot),
      this.generateProjectMetadata(snapshot),
      this.generateTechnologyStack(snapshot),
      this.generateDirectoryStructure(snapshot),
      this.generateDependencies(snapshot),
      this.generateConfiguration(snapshot),
      this.generateCodeOrganization(snapshot),
      this.generateAPISurface(snapshot),
      this.generateTesting(snapshot),
      this.generateDocumentation(snapshot),
      this.generateMetrics(snapshot),
      this.generateQuickStart(snapshot),
      this.generateCommonTasks(),
      this.generateArchitectureDecisions(snapshot),
      this.generateContributionGuide()
    ];

    return sections.filter(Boolean).join('\n\n');
  }

  private generateHeader(snapshot: ProjectSnapshot): string {
    return `# Architecture Documentation: ${snapshot.projectName}

Generated on: ${new Date(snapshot.timestamp).toLocaleString()}  
Version: ${snapshot.version}

---`;
  }

  private generateTableOfContents(): string {
    return `## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Metadata](#project-metadata)
3. [Technology Stack](#technology-stack)
4. [Directory Structure](#directory-structure)
5. [Dependencies](#dependencies)
6. [Configuration](#configuration)
7. [Code Organization](#code-organization)
8. [API Surface](#api-surface)
9. [Testing](#testing)
10. [Documentation](#documentation)
11. [Metrics](#metrics)
12. [Quick Start](#quick-start)
13. [Common Tasks](#common-tasks)
14. [Architecture Decisions](#architecture-decisions)
15. [Contribution Guide](#contribution-guide)`;
  }

  private generateExecutiveSummary(snapshot: ProjectSnapshot): string {
    const { metadata, structure, dependencies, testing } = snapshot;
    
    return `## Executive Summary

**${metadata.name}** is a ${this.describeProjectType(metadata)} project${metadata.description ? ` that ${metadata.description.toLowerCase()}` : ''}.

### Key Statistics
- **Total Files**: ${structure.totalFiles.toLocaleString()}
- **Total Directories**: ${structure.totalDirectories.toLocaleString()}
- **Dependencies**: ${dependencies.totalCount} (${dependencies.outdatedCount} outdated, ${dependencies.vulnerableCount} with vulnerabilities)
- **Test Coverage**: ${testing.coverage ? `${testing.coverage.lines}%` : 'Not measured'}
- **Primary Language**: ${metadata.languages[0]?.name || 'Not detected'}
- **Package Manager**: ${metadata.packageManager || 'npm'}`;
  }

  private generateProjectMetadata(snapshot: ProjectSnapshot): string {
    const { metadata } = snapshot;
    
    let content = `## Project Metadata

| Property | Value |
|----------|-------|
| Name | ${metadata.name} |
| Version | ${metadata.version || 'Not specified'} |
| License | ${metadata.license || 'Not specified'} |
| Author | ${metadata.author || 'Not specified'} |`;

    if (metadata.repository) {
      content += `\n| Repository | [${metadata.repository}](${metadata.repository}) |`;
    }

    if (metadata.nodeVersion) {
      content += `\n| Node Version | ${metadata.nodeVersion} |`;
    }

    return content;
  }

  private generateTechnologyStack(snapshot: ProjectSnapshot): string {
    const { metadata } = snapshot;
    
    const content = `## Technology Stack

### Languages
${metadata.languages.map(lang => 
  `- **${lang.name}**: ${lang.percentage}% of codebase`
).join('\n')}

### Frameworks
${metadata.frameworks.length > 0 
  ? metadata.frameworks.map(fw => `- **${fw.name}** (${fw.type}): ${fw.version}`).join('\n')
  : '- No frameworks detected'}

### Build Tools
${metadata.buildTools.length > 0
  ? metadata.buildTools.map(tool => `- **${tool.name}**: ${tool.configFile}`).join('\n')
  : '- No build tools detected'}`;

    return content;
  }

  private generateDirectoryStructure(snapshot: ProjectSnapshot): string {
    const { structure } = snapshot;
    
    const content = `## Directory Structure

\`\`\`
${this.renderDirectoryTree(structure.root, '', true)}
\`\`\`

### Directory Purposes
${this.extractDirectoryPurposes(structure.root).map(([dir, purpose]) => 
  `- **${dir}/**: ${purpose}`
).join('\n')}

### Naming Conventions
${structure.conventions.map(conv => 
  `- **${conv.pattern}**: ${conv.description} (e.g., ${conv.examples.slice(0, 3).join(', ')})`
).join('\n')}`;

    return content;
  }

  private generateDependencies(snapshot: ProjectSnapshot): string {
    const { dependencies } = snapshot;
    
    let content = `## Dependencies

### Summary
- **Total Dependencies**: ${dependencies.totalCount}
- **Direct**: ${dependencies.direct.length}
- **Dev**: ${dependencies.dev.length}
- **Outdated**: ${dependencies.outdatedCount}
- **Vulnerabilities**: ${dependencies.vulnerableCount}

### Key Dependencies
${dependencies.direct.slice(0, 10).map(dep => 
  `- **${dep.name}** (${dep.version})${dep.description ? `: ${dep.description}` : ''}`
).join('\n')}
${dependencies.direct.length > 10 ? `\n... and ${dependencies.direct.length - 10} more` : ''}

### License Distribution
${dependencies.licenses.map(lic => 
  `- **${lic.name}**: ${lic.count} packages`
).join('\n')}`;

    if (dependencies.vulnerableCount > 0) {
      content += `\n\n### ⚠️ Security Vulnerabilities
${dependencies.direct.concat(dependencies.dev)
  .filter(dep => dep.vulnerabilities && dep.vulnerabilities.length > 0)
  .slice(0, 5)
  .map(dep => `- **${dep.name}**: ${dep.vulnerabilities!.map(v => v.severity).join(', ')}`)
  .join('\n')}`;
    }

    return content;
  }

  private generateConfiguration(snapshot: ProjectSnapshot): string {
    const { configuration } = snapshot;
    
    let content = `## Configuration

### Environment Variables
${configuration.environmentVariables.length > 0
  ? configuration.environmentVariables.map(env => 
    `- **${env.name}**${env.required ? ' (required)' : ''}: ${env.description || 'No description'}`
  ).join('\n')
  : 'No environment variables detected'}

### Configuration Files
${configuration.configFiles.map(file => 
  `- **${file.path}**: ${file.purpose}`
).join('\n')}`;

    if (configuration.featureFlags.length > 0) {
      content += `\n\n### Feature Flags
${configuration.featureFlags.map(flag => 
  `- **${flag.name}**: ${flag.description || 'No description'} (default: ${flag.defaultValue})`
).join('\n')}`;
    }

    return content;
  }

  private generateCodeOrganization(snapshot: ProjectSnapshot): string {
    const { codeOrganization } = snapshot;
    
    let content = `## Code Organization

### Entry Points
${codeOrganization.entryPoints.map(entry => 
  `- **${entry.type}**: \`${entry.path}\`${entry.description ? ` - ${entry.description}` : ''}`
).join('\n')}

### Architectural Layers
${codeOrganization.layers.map(layer => 
  `- **${layer.name}**: ${layer.purpose}\n  - Directories: ${layer.directories.join(', ')}`
).join('\n')}`;

    if (codeOrganization.patterns.length > 0) {
      content += `\n\n### Design Patterns
${codeOrganization.patterns.map(pattern => 
  `- **${pattern.name}**: ${pattern.description}\n  - Found in: ${pattern.locations.slice(0, 3).join(', ')}${pattern.locations.length > 3 ? '...' : ''}`
).join('\n')}`;
    }

    return content;
  }

  private generateAPISurface(snapshot: ProjectSnapshot): string {
    const { apiSurface } = snapshot;
    
    if (!apiSurface.rest && !apiSurface.graphql && !apiSurface.cli && !apiSurface.websocket) {
      return '## API Surface\n\nNo API surface detected.';
    }

    let content = '## API Surface\n';

    if (apiSurface.rest && apiSurface.rest.length > 0) {
      content += `\n### REST Endpoints
${apiSurface.rest.slice(0, 10).map(endpoint => 
  `- **${endpoint.method} ${endpoint.path}**${endpoint.description ? `: ${endpoint.description}` : ''}`
).join('\n')}
${apiSurface.rest.length > 10 ? `\n... and ${apiSurface.rest.length - 10} more endpoints` : ''}`;
    }

    if (apiSurface.cli && apiSurface.cli.length > 0) {
      content += `\n\n### CLI Commands
${apiSurface.cli.map(cmd => 
  `- **${cmd.name}**${cmd.description ? `: ${cmd.description}` : ''}`
).join('\n')}`;
    }

    return content;
  }

  private generateTesting(snapshot: ProjectSnapshot): string {
    const { testing } = snapshot;
    
    let content = `## Testing

### Test Framework
${testing.framework || 'No test framework detected'}

### Test Statistics
- **Test Files**: ${testing.testFiles}
- **Test Suites**: ${testing.testSuites}`;

    if (testing.coverage) {
      content += `\n\n### Code Coverage
- **Lines**: ${testing.coverage.lines}%
- **Functions**: ${testing.coverage.functions}%
- **Branches**: ${testing.coverage.branches}%
- **Statements**: ${testing.coverage.statements}%`;
    }

    if (testing.types.length > 0) {
      content += `\n\n### Test Types
${testing.types.map(type => 
  `- **${type.type}**: ${type.count} tests`
).join('\n')}`;
    }

    return content;
  }

  private generateDocumentation(snapshot: ProjectSnapshot): string {
    const { documentation } = snapshot;
    
    let content = `## Documentation

### README Files
${documentation.readmeFiles.map(doc => 
  `- **${doc.path}**: ${doc.title}`
).join('\n')}

### Comment Density
${documentation.commentDensity}% of code lines have comments`;

    if (documentation.examples && documentation.examples.length > 0) {
      content += `\n\n### Code Examples
${documentation.examples.map(ex => 
  `- **${ex.title}**: \`${ex.path}\` (${ex.language})`
).join('\n')}`;
    }

    return content;
  }

  private generateMetrics(snapshot: ProjectSnapshot): string {
    const { metrics } = snapshot;
    
    let content = `## Project Metrics

### Code Statistics
- **Total Files**: ${metrics.totalFiles.toLocaleString()}
- **Total Lines**: ${metrics.totalLines.toLocaleString()}
- **Code Lines**: ${metrics.codeLines.toLocaleString()}
- **Comment Lines**: ${metrics.commentLines.toLocaleString()}
- **Blank Lines**: ${metrics.blankLines.toLocaleString()}`;

    if (metrics.complexity) {
      content += `\n\n### Complexity
- **Average Complexity**: ${metrics.complexity.average.toFixed(2)}
- **Highest Complexity**: ${metrics.complexity.highest} (${metrics.complexity.highestFile})`;
    }

    return content;
  }

  private generateQuickStart(snapshot: ProjectSnapshot): string {
    const { metadata } = snapshot;
    const packageManager = metadata.packageManager || 'npm';
    
    return `## Quick Start

### Prerequisites
${metadata.nodeVersion ? `- Node.js ${metadata.nodeVersion}` : '- Node.js (version not specified)'}
${metadata.pythonVersion ? `- Python ${metadata.pythonVersion}` : ''}
${metadata.javaVersion ? `- Java ${metadata.javaVersion}` : ''}

### Installation
\`\`\`bash
# Clone the repository
git clone ${metadata.repository || '<repository-url>'}

# Install dependencies
${packageManager} install
\`\`\`

### Running the Project
\`\`\`bash
# Development mode
${packageManager} ${packageManager === 'npm' ? 'run' : ''} dev

# Production build
${packageManager} ${packageManager === 'npm' ? 'run' : ''} build

# Run tests
${packageManager} ${packageManager === 'npm' ? 'run' : ''} test
\`\`\``;
  }

  private generateCommonTasks(): string {
    return `## Common Tasks

### Adding a New Feature
1. Create a new branch from \`main\`
2. Implement your feature in the appropriate directory
3. Add tests for your feature
4. Update documentation if needed
5. Submit a pull request

### Running Tests
\`\`\`bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
\`\`\`

### Building for Production
\`\`\`bash
# Create production build
npm run build

# Preview production build
npm run preview
\`\`\``;
  }

  private generateArchitectureDecisions(snapshot: ProjectSnapshot): string {
    const { metadata, codeOrganization } = snapshot;
    
    return `## Architecture Decisions

### Framework Choice
${this.explainFrameworkChoice(metadata)}

### Project Structure
${this.explainProjectStructure(codeOrganization)}

### State Management
${this.explainStateManagement(metadata)}

### Testing Strategy
${this.explainTestingStrategy(snapshot)}`;
  }

  private generateContributionGuide(): string {
    return `## Contribution Guide

### Code Style
- Follow the existing code style and conventions
- Use the project's linter and formatter
- Write meaningful commit messages

### Pull Request Process
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add/update tests
5. Update documentation
6. Submit a pull request

### Review Process
- All code must be reviewed before merging
- Tests must pass
- Documentation must be updated
- No decrease in code coverage`;
  }

  // Helper methods
  private renderDirectoryTree(node: DirectoryNode, prefix: string, isLast: boolean, depth: number = 0): string {
    if (depth > 5) return ''; // Limit depth for readability
    
    let result = '';
    const connector = isLast ? '└── ' : '├── ';
    const extension = isLast ? '    ' : '│   ';
    
    if (node.name !== '.') {
      result += prefix + connector + node.name;
      if (node.purpose) {
        result += ` # ${node.purpose}`;
      }
      result += '\n';
    }
    
    if (node.children && node.children.length > 0) {
      const childPrefix = node.name === '.' ? '' : prefix + extension;
      node.children.forEach((child, index) => {
        const isLastChild = index === node.children!.length - 1;
        result += this.renderDirectoryTree(child, childPrefix, isLastChild, depth + 1);
      });
    }
    
    return result;
  }

  private extractDirectoryPurposes(node: DirectoryNode, purposes: [string, string][] = []): [string, string][] {
    if (node.purpose && node.name !== '.') {
      purposes.push([node.name, node.purpose]);
    }
    
    if (node.children) {
      node.children.forEach(child => {
        if (child.type === 'directory') {
          this.extractDirectoryPurposes(child, purposes);
        }
      });
    }
    
    return purposes;
  }

  private describeProjectType(metadata: ProjectMetadata): string {
    const frameworks = metadata.frameworks;
    if (frameworks.length === 0) return 'software';
    
    const types = frameworks.map((f: unknown) => (typeof f === 'object' && f !== null && 'type' in f ? (f as { type: string }).type : undefined));
    if (types.includes('fullstack')) return 'full-stack web application';
    if (types.includes('frontend')) return 'frontend application';
    if (types.includes('backend')) return 'backend service';
    
    return 'software';
  }

  private explainFrameworkChoice(metadata: ProjectMetadata): string {
    const mainFramework = metadata.frameworks[0];
    if (!mainFramework) return 'No specific framework is used in this project.';
    
    const explanations: Record<string, string> = {
      'react': 'React was chosen for its component-based architecture and large ecosystem.',
      'vue': 'Vue.js provides a progressive framework with excellent developer experience.',
      'angular': 'Angular offers a complete solution with built-in features for large applications.',
      'express': 'Express.js provides a minimal and flexible Node.js web application framework.',
      'next': 'Next.js combines React with server-side rendering and excellent developer experience.',
      'nestjs': 'NestJS provides an enterprise-grade Node.js framework with TypeScript support.'
    };
    
    return explanations[(mainFramework as { name: string }).name] || `${(mainFramework as { name: string }).name} is used as the main framework.`;
  }

  private explainProjectStructure(codeOrganization: unknown): string {
    if (!codeOrganization || typeof codeOrganization !== 'object' || !('layers' in codeOrganization)) {
      return 'The project uses a simple structure without distinct architectural layers.';
    }
    const layers = (codeOrganization as { layers: Array<{ name: string }> }).layers;
    if (!Array.isArray(layers) || layers.length === 0) {
      return 'The project uses a simple structure without distinct architectural layers.';
    }
    const layerNames = layers.map((l) => l.name).join(', ');
    return `The project is organized into ${layers.length} layers: ${layerNames}. This separation of concerns improves maintainability and testability.`;
  }

  private explainStateManagement(metadata: ProjectMetadata): string {
    const stateLibs = ['redux', 'mobx', 'zustand', 'recoil', 'vuex', 'pinia'];
    const framework = metadata.frameworks.find((f: unknown) => typeof f === 'object' && f !== null && 'name' in f && stateLibs.includes((f as { name: string }).name));
    if (framework && typeof framework === 'object' && framework !== null && 'name' in framework) {
      const name = (framework as { name: string }).name;
      return `${name} is used for state management, providing ${name === 'redux' ? 'predictable state updates' : 'reactive state management'}.`;
    }
    
    return 'State is managed using the framework\'s built-in capabilities.';
  }

  private explainTestingStrategy(snapshot: ProjectSnapshot): string {
    const { testing } = snapshot;
    if (!testing.framework) {
      return 'No formal testing framework is configured.';
    }
    
    let strategy = `The project uses ${testing.framework} as the primary testing framework`;
    
    if (testing.types.length > 0) {
      const testTypes = testing.types.map(t => t.type).join(', ');
      strategy += ` with ${testTypes} tests`;
    }
    
    if (testing.coverage) {
      strategy += ` and maintains ${testing.coverage.lines}% code coverage`;
    }
    
    return strategy + '.';
  }
} 