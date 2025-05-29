import fs from 'fs/promises';
import path from 'path';
import { ProjectMetadata, LanguageInfo, FrameworkInfo, BuildTool } from '../../../types/architectureSnapshot.js';

const FRAMEWORK_PATTERNS: Record<string, { type: FrameworkInfo['type']; patterns: string[] }> = {
  // Frontend frameworks
  'react': { type: 'frontend', patterns: ['react', 'react-dom'] },
  'vue': { type: 'frontend', patterns: ['vue'] },
  'angular': { type: 'frontend', patterns: ['@angular/core'] },
  'svelte': { type: 'frontend', patterns: ['svelte'] },
  'next': { type: 'fullstack', patterns: ['next'] },
  'nuxt': { type: 'fullstack', patterns: ['nuxt'] },
  'gatsby': { type: 'frontend', patterns: ['gatsby'] },
  
  // Backend frameworks
  'express': { type: 'backend', patterns: ['express'] },
  'fastify': { type: 'backend', patterns: ['fastify'] },
  'koa': { type: 'backend', patterns: ['koa'] },
  'nestjs': { type: 'backend', patterns: ['@nestjs/core'] },
  'hapi': { type: 'backend', patterns: ['@hapi/hapi'] },
  
  // Testing frameworks
  'jest': { type: 'testing', patterns: ['jest'] },
  'mocha': { type: 'testing', patterns: ['mocha'] },
  'vitest': { type: 'testing', patterns: ['vitest'] },
  'cypress': { type: 'testing', patterns: ['cypress'] },
  'playwright': { type: 'testing', patterns: ['@playwright/test'] },
  
  // Build tools
  'webpack': { type: 'build', patterns: ['webpack'] },
  'vite': { type: 'build', patterns: ['vite'] },
  'rollup': { type: 'build', patterns: ['rollup'] },
  'parcel': { type: 'build', patterns: ['parcel'] },
  'esbuild': { type: 'build', patterns: ['esbuild'] },
  'turbo': { type: 'build', patterns: ['turbo'] }
};

export class MetadataCollector {
  async collect(projectPath: string): Promise<ProjectMetadata> {
    const metadata: ProjectMetadata = {
      name: path.basename(projectPath),
      languages: [],
      frameworks: [],
      buildTools: []
    };

    // Try to read package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = await this.readJsonFile(packageJsonPath);
    
    if (typeof packageJson === 'object' && packageJson !== null) {
      const pkg = packageJson as { [key: string]: unknown };
      if (typeof pkg.name === 'string') metadata.name = pkg.name;
      if (typeof pkg.version === 'string') metadata.version = pkg.version;
      if (typeof pkg.description === 'string') metadata.description = pkg.description;
      metadata.repository = this.extractRepository(pkg.repository);
      metadata.author = this.extractAuthor(pkg.author);
      if (typeof pkg.license === 'string') metadata.license = pkg.license;
      metadata.packageManager = await this.detectPackageManager(projectPath);
      
      // Detect frameworks
      metadata.frameworks = this.detectFrameworks(pkg);
      
      // Detect build tools
      metadata.buildTools = await this.detectBuildTools(projectPath, pkg);
    }

    // Detect languages
    metadata.languages = await this.detectLanguages(projectPath);
    
    // Detect runtime versions
    const runtimeVersions = await this.detectRuntimeVersions(projectPath);
    Object.assign(metadata, runtimeVersions);

    return metadata;
  }

  private async readJsonFile(filePath: string): Promise<unknown> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private extractRepository(repo: unknown): string | undefined {
    if (typeof repo === 'string') return repo;
    if (typeof repo === 'object' && repo !== null && 'url' in repo && typeof (repo as { url: unknown }).url === 'string') {
      return ((repo as { url: string }).url).replace(/^git\+/, '').replace(/\.git$/, '');
    }
    return undefined;
  }

  private extractAuthor(author: unknown): string | undefined {
    if (typeof author === 'string') return author;
    if (typeof author === 'object' && author !== null && 'name' in author && typeof (author as { name: unknown }).name === 'string') {
      return (author as { name: string }).name;
    }
    return undefined;
  }

  private async detectPackageManager(projectPath: string): Promise<string | undefined> {
    const checks = [
      { file: 'pnpm-lock.yaml', manager: 'pnpm' },
      { file: 'yarn.lock', manager: 'yarn' },
      { file: 'package-lock.json', manager: 'npm' },
      { file: 'bun.lockb', manager: 'bun' }
    ];

    for (const check of checks) {
      try {
        await fs.access(path.join(projectPath, check.file));
        return check.manager;
      } catch {
        // File doesn't exist, continue
      }
    }

    return 'npm'; // Default
  }

  private detectFrameworks(packageJson: unknown): FrameworkInfo[] {
    const frameworks: FrameworkInfo[] = [];
    if (typeof packageJson === 'object' && packageJson !== null) {
      const pkg = packageJson as { [key: string]: unknown };
      const allDeps = {
        ...(typeof pkg.dependencies === 'object' && pkg.dependencies !== null ? pkg.dependencies : {}),
        ...(typeof pkg.devDependencies === 'object' && pkg.devDependencies !== null ? pkg.devDependencies : {})
      };
      if (typeof allDeps === 'object' && allDeps !== null) {
        for (const [name, config] of Object.entries(FRAMEWORK_PATTERNS)) {
          for (const pattern of config.patterns) {
            if (Object.prototype.hasOwnProperty.call(allDeps, pattern) && typeof (allDeps as Record<string, unknown>)[pattern] === 'string') {
              frameworks.push({
                name,
                version: (allDeps as Record<string, string>)[pattern],
                type: config.type
              });
              break;
            }
          }
        }
      }
    }
    return frameworks;
  }

  private async detectBuildTools(projectPath: string, packageJson: unknown): Promise<BuildTool[]> {
    const buildTools: BuildTool[] = [];
    let scripts: unknown = undefined;
    if (typeof packageJson === 'object' && packageJson !== null) {
      const pkg = packageJson as { [key: string]: unknown };
      scripts = pkg.scripts;
    }

    // Check for common build tool config files
    const configChecks = [
      { file: 'webpack.config.js', name: 'webpack' },
      { file: 'vite.config.js', name: 'vite' },
      { file: 'rollup.config.js', name: 'rollup' },
      { file: '.parcelrc', name: 'parcel' },
      { file: 'turbo.json', name: 'turbo' },
      { file: 'tsconfig.json', name: 'typescript' },
      { file: 'babel.config.js', name: 'babel' },
      { file: '.babelrc', name: 'babel' }
    ];

    for (const check of configChecks) {
      try {
        await fs.access(path.join(projectPath, check.file));
        buildTools.push({
          name: check.name,
          configFile: check.file,
          scripts: check.name === 'typescript' || check.name === 'babel' ? undefined : scripts as Record<string, string> | undefined
        });
      } catch {
        // File doesn't exist
      }
    }

    // Add npm scripts as a build tool if present
    if (scripts && Object.keys(scripts).length > 0) {
      buildTools.push({
        name: 'npm-scripts',
        configFile: 'package.json',
        scripts: scripts as Record<string, string>
      });
    }

    return buildTools;
  }

  private async detectLanguages(projectPath: string): Promise<LanguageInfo[]> {
    // This is a simplified version - in a real implementation,
    // we would recursively scan the project and count files/lines

    // For now, we'll do a simple check for common files
    // In a full implementation, this would scan the entire project
    const hasTypeScript = await this.fileExists(projectPath, 'tsconfig.json');
    const hasJavaScript = await this.fileExists(projectPath, 'package.json');

    const result: LanguageInfo[] = [];

    if (hasTypeScript) {
      result.push({
        name: 'TypeScript',
        percentage: 60, // Placeholder
        fileCount: 0, // Would be calculated
        lineCount: 0 // Would be calculated
      });
    }

    if (hasJavaScript) {
      result.push({
        name: 'JavaScript',
        percentage: hasTypeScript ? 40 : 100, // Placeholder
        fileCount: 0, // Would be calculated
        lineCount: 0 // Would be calculated
      });
    }

    return result;
  }

  private async detectRuntimeVersions(projectPath: string): Promise<{
    nodeVersion?: string;
    pythonVersion?: string;
    javaVersion?: string;
  }> {
    const versions: Record<string, string> = {};

    // Check for .nvmrc (Node version)
    const nvmrcPath = path.join(projectPath, '.nvmrc');
    try {
      const nvmrc = await fs.readFile(nvmrcPath, 'utf-8');
      versions.nodeVersion = nvmrc.trim();
    } catch {
      // Check package.json engines
      const packageJson = await this.readJsonFile(path.join(projectPath, 'package.json'));
      if (
        typeof packageJson === 'object' && packageJson !== null &&
        'engines' in packageJson &&
        typeof (packageJson as { engines?: unknown }).engines === 'object' &&
        (packageJson as { engines?: unknown }).engines !== null &&
        'node' in (packageJson as { engines: { [key: string]: unknown } }).engines &&
        typeof ((packageJson as { engines: { [key: string]: unknown } }).engines as { [key: string]: unknown }).node === 'string'
      ) {
        versions.nodeVersion = ((packageJson as { engines: { [key: string]: unknown } }).engines as { [key: string]: string }).node;
      }
    }

    // Check for .python-version
    const pythonVersionPath = path.join(projectPath, '.python-version');
    try {
      const pythonVersion = await fs.readFile(pythonVersionPath, 'utf-8');
      versions.pythonVersion = pythonVersion.trim();
    } catch {
      // Check for Pipfile
      const pipfile = await this.readJsonFile(path.join(projectPath, 'Pipfile'));
      if (
        typeof pipfile === 'object' && pipfile !== null &&
        'requires' in pipfile &&
        typeof (pipfile as { requires?: unknown }).requires === 'object' &&
        (pipfile as { requires?: unknown }).requires !== null &&
        'python_version' in (pipfile as { requires: { [key: string]: unknown } }).requires &&
        typeof ((pipfile as { requires: { [key: string]: unknown } }).requires as { [key: string]: unknown }).python_version === 'string'
      ) {
        versions.pythonVersion = ((pipfile as { requires: { [key: string]: unknown } }).requires as { [key: string]: string }).python_version;
      }
    }

    // Check for .java-version
    const javaVersionPath = path.join(projectPath, '.java-version');
    try {
      const javaVersion = await fs.readFile(javaVersionPath, 'utf-8');
      versions.javaVersion = javaVersion.trim();
    } catch {
      // Could check pom.xml or build.gradle here
    }

    return versions;
  }

  private async fileExists(projectPath: string, fileName: string): Promise<boolean> {
    try {
      await fs.access(path.join(projectPath, fileName));
      return true;
    } catch {
      return false;
    }
  }
} 