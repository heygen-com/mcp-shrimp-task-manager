import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { 
  ProjectSnapshot, 
  DependencyInfo, 
  ConfigurationInfo,
  CodeOrganization,
  APISurface,
  TestingInfo,
  DocumentationInfo,
  ProjectMetrics
} from '../../types/architectureSnapshot.js';
import { FileSystemCollector } from './collectors/fileSystemCollector.js';
import { MetadataCollector } from './collectors/metadataCollector.js';
import { MarkdownGenerator } from './generators/markdownGenerator.js';

export class ArchitectureAnalyzer {
  private fileSystemCollector: FileSystemCollector;
  private metadataCollector: MetadataCollector;
  private markdownGenerator: MarkdownGenerator;

  constructor() {
    this.fileSystemCollector = new FileSystemCollector();
    this.metadataCollector = new MetadataCollector();
    this.markdownGenerator = new MarkdownGenerator();
  }

  async analyze(projectPath: string, options?: {
    depth?: 'shallow' | 'deep';
    includeNodeModules?: boolean;
  }): Promise<ProjectSnapshot> {
    console.log(`Starting architecture analysis for: ${projectPath}`);
    const startTime = Date.now();

    // Collect all information
    const [metadata, structure] = await Promise.all([
      this.metadataCollector.collect(projectPath),
      this.fileSystemCollector.collect(projectPath, {
        maxDepth: options?.depth === 'shallow' ? 3 : undefined,
        includeNodeModules: options?.includeNodeModules
      })
    ]);

    // For now, we'll create placeholder data for other sections
    // In a full implementation, these would have their own collectors
    const dependencies = await this.analyzeDependencies(projectPath);
    const configuration = await this.analyzeConfiguration(projectPath);
    const codeOrganization = await this.analyzeCodeOrganization();
    const apiSurface = await this.analyzeAPISurface();
    const testing = await this.analyzeTesting();
    const documentation = await this.analyzeDocumentation();
    const metrics = await this.calculateMetrics(structure);

    const snapshot: ProjectSnapshot = {
      id: uuidv4(),
      version: '1.0.0',
      timestamp: new Date(),
      projectPath,
      projectName: metadata.name,
      metadata,
      structure,
      dependencies,
      configuration,
      codeOrganization,
      apiSurface,
      testing,
      documentation,
      metrics
    };

    const duration = Date.now() - startTime;
    console.log(`Architecture analysis completed in ${duration}ms`);

    return snapshot;
  }

  async generateReport(snapshot: ProjectSnapshot, outputPath: string): Promise<string> {
    const markdown = this.markdownGenerator.generate(snapshot);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    
    // Save markdown report
    const markdownPath = outputPath.endsWith('.md') ? outputPath : `${outputPath}/architecture.md`;
    await fs.writeFile(markdownPath, markdown);
    
    // Save JSON snapshot
    const jsonPath = markdownPath.replace('.md', '.json');
    await fs.writeFile(jsonPath, JSON.stringify(snapshot, null, 2));
    
    console.log(`Architecture report saved to: ${markdownPath}`);
    console.log(`JSON snapshot saved to: ${jsonPath}`);
    
    return markdownPath;
  }

  private async analyzeDependencies(projectPath: string): Promise<DependencyInfo> {
    // Simplified implementation - in reality, this would parse package.json
    // and potentially run npm/yarn commands to get detailed info
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const direct = Object.entries(packageJson.dependencies || {}).map(([name, version]) => ({
        name,
        version: version as string
      }));
      const dev = Object.entries(packageJson.devDependencies || {}).map(([name, version]) => ({
        name,
        version: version as string
      }));

      return {
        direct,
        dev,
        totalCount: direct.length + dev.length,
        outdatedCount: 0, // Would need to check npm registry
        vulnerableCount: 0, // Would need to run audit
        licenses: [] // Would need to analyze each package
      };
    } catch {
      return {
        direct: [],
        dev: [],
        totalCount: 0,
        outdatedCount: 0,
        vulnerableCount: 0,
        licenses: []
      };
    }
  }

  private async analyzeConfiguration(projectPath: string): Promise<ConfigurationInfo> {
    const configFiles = [];
    const envVariables = [];

    // Check for common config files
    const commonConfigs = [
      { path: '.env', type: 'environment', purpose: 'Environment variables' },
      { path: '.env.example', type: 'environment', purpose: 'Environment variable template' },
      { path: 'config.json', type: 'json', purpose: 'Application configuration' },
      { path: 'tsconfig.json', type: 'typescript', purpose: 'TypeScript configuration' },
      { path: '.eslintrc.json', type: 'eslint', purpose: 'ESLint configuration' },
      { path: '.prettierrc', type: 'prettier', purpose: 'Prettier configuration' }
    ];

    for (const config of commonConfigs) {
      try {
        await fs.access(path.join(projectPath, config.path));
        configFiles.push(config);
      } catch {
        // File doesn't exist
      }
    }

    // Parse .env.example for environment variables
    try {
      const envExample = await fs.readFile(path.join(projectPath, '.env.example'), 'utf-8');
      const lines = envExample.split('\n');
      for (const line of lines) {
        if (line.includes('=') && !line.startsWith('#')) {
          const [name] = line.split('=');
          envVariables.push({
            name: name.trim(),
            required: true,
            usedIn: []
          });
        }
      }
    } catch {
      // No .env.example file
    }

    return {
      environmentVariables: envVariables,
      configFiles,
      featureFlags: [],
      buildConfigs: []
    };
  }

  private async analyzeCodeOrganization(): Promise<CodeOrganization> {
    const entryPoints = [];
    const layers = [];

    // Detect common entry points
    const commonEntryPoints = [
      { path: 'src/index.ts', type: 'main' as const },
      { path: 'src/main.ts', type: 'main' as const },
      { path: 'src/app.ts', type: 'main' as const },
      { path: 'src/server.ts', type: 'api' as const },
      { path: 'src/cli.ts', type: 'cli' as const },
      { path: 'bin/cli.js', type: 'cli' as const }
    ];

    for (const entry of commonEntryPoints) {
      try {
        await fs.access(path.join(process.cwd(), entry.path));
        entryPoints.push(entry);
      } catch {
        // File doesn't exist
      }
    }

    // Detect architectural layers based on directory structure
    const srcPath = path.join(process.cwd(), 'src');
    try {
      const srcDirs = await fs.readdir(srcPath, { withFileTypes: true });
      
      const layerMappings: Record<string, string> = {
        'controllers': 'Controller Layer',
        'services': 'Service Layer',
        'models': 'Data Model Layer',
        'views': 'View Layer',
        'components': 'Component Layer',
        'utils': 'Utility Layer',
        'middleware': 'Middleware Layer',
        'routes': 'Routing Layer'
      };

      for (const dir of srcDirs) {
        if (dir.isDirectory() && layerMappings[dir.name]) {
          layers.push({
            name: layerMappings[dir.name],
            directories: [`src/${dir.name}`],
            purpose: `Handles ${dir.name} logic`,
            dependencies: []
          });
        }
      }
    } catch {
      // No src directory
    }

    return {
      entryPoints,
      modules: [],
      layers,
      patterns: [],
      conventions: []
    };
  }

  private async analyzeAPISurface(): Promise<APISurface> {
    // This is a placeholder - in a real implementation,
    // we would parse route files, OpenAPI specs, etc.
    return {};
  }

  private async analyzeTesting(): Promise<TestingInfo> {
    let framework = '';
    const testFiles = 0;

    // Detect test framework
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (allDeps.jest) framework = 'Jest';
      else if (allDeps.mocha) framework = 'Mocha';
      else if (allDeps.vitest) framework = 'Vitest';
      else if (allDeps['@playwright/test']) framework = 'Playwright';
      else if (allDeps.cypress) framework = 'Cypress';
    } catch {
      // No package.json
    }

    // Count test files (simplified)
    // In a real implementation, we would recursively search for these patterns

    return {
      framework,
      testFiles,
      testSuites: 0,
      types: []
    };
  }

  private async analyzeDocumentation(): Promise<DocumentationInfo> {
    const readmeFiles = [];
    
    // Check for README files
    const readmePatterns = ['README.md', 'readme.md', 'README.txt', 'docs/README.md'];
    
    for (const pattern of readmePatterns) {
      try {
        const filePath = path.join(process.cwd(), pattern);
        await fs.access(filePath);
        readmeFiles.push({
          path: pattern,
          title: 'Project README',
          lastUpdated: new Date()
        });
      } catch {
        // File doesn't exist
      }
    }

    return {
      readmeFiles,
      commentDensity: 0 // Would need to analyze all source files
    };
  }

  private async calculateMetrics(structure: unknown): Promise<ProjectMetrics> {
    if (typeof structure === 'object' && structure !== null && 'totalFiles' in structure && typeof (structure as { totalFiles: unknown }).totalFiles === 'number') {
      return {
        totalFiles: (structure as { totalFiles: number }).totalFiles,
        totalLines: 0, // Would need to count lines in all files
        codeLines: 0,
        commentLines: 0,
        blankLines: 0
      };
    }
    // Fallback if structure is not as expected
    return {
      totalFiles: 0,
      totalLines: 0,
      codeLines: 0,
      commentLines: 0,
      blankLines: 0
    };
  }
} 