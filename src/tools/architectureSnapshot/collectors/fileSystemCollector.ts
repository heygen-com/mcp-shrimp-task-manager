import fs from 'fs/promises';
import path from 'path';
import { DirectoryStructure, DirectoryNode, FileStats, NamingConvention } from '../../../types/architectureSnapshot.js';

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.vscode',
  '.idea',
  '*.log',
  '.DS_Store',
  'thumbs.db'
];

const PURPOSE_MAPPINGS: Record<string, string> = {
  'src': 'Source code',
  'lib': 'Library code',
  'test': 'Test files',
  'tests': 'Test files',
  'spec': 'Test specifications',
  'docs': 'Documentation',
  'public': 'Public assets',
  'static': 'Static assets',
  'assets': 'Asset files',
  'config': 'Configuration files',
  'scripts': 'Build/utility scripts',
  'api': 'API endpoints',
  'components': 'UI components',
  'pages': 'Page components',
  'views': 'View templates',
  'models': 'Data models',
  'controllers': 'Controllers',
  'services': 'Service layer',
  'utils': 'Utility functions',
  'helpers': 'Helper functions',
  'hooks': 'React hooks',
  'store': 'State management',
  'styles': 'Stylesheets',
  'types': 'TypeScript types',
  'interfaces': 'Interface definitions',
  'migrations': 'Database migrations',
  'seeds': 'Database seeds',
  'fixtures': 'Test fixtures'
};

export class FileSystemCollector {
  private fileCount = 0;
  private directoryCount = 0;
  private maxDepth = 0;
  private extensions = new Map<string, number>();
  private namingPatterns = new Map<string, string[]>();

  async collect(projectPath: string, options?: { maxDepth?: number; includeNodeModules?: boolean }): Promise<DirectoryStructure> {
    this.reset();
    
    const root = await this.scanDirectory(projectPath, 0, options);
    const conventions = this.detectNamingConventions();
    
    return {
      root,
      totalFiles: this.fileCount,
      totalDirectories: this.directoryCount,
      maxDepth: this.maxDepth,
      conventions
    };
  }

  private reset() {
    this.fileCount = 0;
    this.directoryCount = 0;
    this.maxDepth = 0;
    this.extensions.clear();
    this.namingPatterns.clear();
  }

  private async scanDirectory(
    dirPath: string,
    depth: number,
    options?: { maxDepth?: number; includeNodeModules?: boolean }
  ): Promise<DirectoryNode> {
    if (options?.maxDepth && depth > options.maxDepth) {
      return this.createDirectoryNode(dirPath, '(truncated)');
    }

    this.maxDepth = Math.max(this.maxDepth, depth);
    this.directoryCount++;

    const dirName = path.basename(dirPath);
    const node = this.createDirectoryNode(dirPath, dirName);

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const children: DirectoryNode[] = [];

      for (const entry of entries) {
        if (this.shouldIgnore(entry.name, options)) continue;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const childNode = await this.scanDirectory(fullPath, depth + 1, options);
          children.push(childNode);
          this.trackNamingPattern(entry.name);
        } else if (entry.isFile()) {
          const fileNode = await this.createFileNode(fullPath, entry.name);
          children.push(fileNode);
          this.fileCount++;
          this.trackNamingPattern(entry.name);
        }
      }

      node.children = children.sort((a, b) => {
        // Directories first, then files
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch {
      // intentionally left blank
    }

    return node;
  }

  private createDirectoryNode(dirPath: string, name: string): DirectoryNode {
    const purpose = this.detectPurpose(name);
    return {
      name,
      path: dirPath,
      type: 'directory',
      purpose,
      children: []
    };
  }

  private async createFileNode(filePath: string, name: string): Promise<DirectoryNode> {
    const stats = await fs.stat(filePath);
    const extension = path.extname(name).toLowerCase();
    
    this.extensions.set(extension, (this.extensions.get(extension) || 0) + 1);

    const fileStats: FileStats = {
      extension,
      size: stats.size,
      lastModified: stats.mtime
    };

    // Count lines for text files
    if (this.isTextFile(extension)) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        fileStats.lines = content.split('\n').length;
      } catch {
        // intentionally left blank
      }
    }

    return {
      name,
      path: filePath,
      type: 'file',
      fileStats
    };
  }

  private shouldIgnore(name: string, options?: { includeNodeModules?: boolean }): boolean {
    if (!options?.includeNodeModules && name === 'node_modules') {
      return true;
    }

    return IGNORE_PATTERNS.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(name);
      }
      return name === pattern;
    });
  }

  private detectPurpose(name: string): string | undefined {
    const lowerName = name.toLowerCase();
    return PURPOSE_MAPPINGS[lowerName];
  }

  private isTextFile(extension: string): boolean {
    const textExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt',
      '.css', '.scss', '.sass', '.less', '.html', '.xml',
      '.yml', '.yaml', '.toml', '.ini', '.env', '.sh',
      '.py', '.rb', '.go', '.java', '.c', '.cpp', '.h',
      '.php', '.sql', '.graphql', '.vue', '.svelte'
    ];
    return textExtensions.includes(extension);
  }

  private trackNamingPattern(name: string) {
    // Track camelCase
    if (/^[a-z][a-zA-Z0-9]*$/.test(name)) {
      this.addPattern('camelCase', name);
    }
    // Track PascalCase
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      this.addPattern('PascalCase', name);
    }
    // Track kebab-case
    else if (/^[a-z]+(-[a-z]+)*$/.test(name)) {
      this.addPattern('kebab-case', name);
    }
    // Track snake_case
    else if (/^[a-z]+(_[a-z]+)*$/.test(name)) {
      this.addPattern('snake_case', name);
    }
    // Track SCREAMING_SNAKE_CASE
    else if (/^[A-Z]+(_[A-Z]+)*$/.test(name)) {
      this.addPattern('SCREAMING_SNAKE_CASE', name);
    }
    // Track dot.notation
    else if (/^[a-z]+(\.[a-z]+)+$/.test(name)) {
      this.addPattern('dot.notation', name);
    }
  }

  private addPattern(pattern: string, example: string) {
    if (!this.namingPatterns.has(pattern)) {
      this.namingPatterns.set(pattern, []);
    }
    const examples = this.namingPatterns.get(pattern)!;
    if (examples.length < 5 && !examples.includes(example)) {
      examples.push(example);
    }
  }

  private detectNamingConventions(): NamingConvention[] {
    const conventions: NamingConvention[] = [];

    for (const [pattern, examples] of this.namingPatterns.entries()) {
      let description = '';
      switch (pattern) {
        case 'camelCase':
          description = 'Variable and function names';
          break;
        case 'PascalCase':
          description = 'Class and component names';
          break;
        case 'kebab-case':
          description = 'File and directory names';
          break;
        case 'snake_case':
          description = 'Python-style naming';
          break;
        case 'SCREAMING_SNAKE_CASE':
          description = 'Constants and environment variables';
          break;
        case 'dot.notation':
          description = 'Configuration and test files';
          break;
      }

      conventions.push({
        pattern,
        description,
        examples
      });
    }

    return conventions;
  }

  getFileTypeDistribution(): Map<string, number> {
    return new Map(this.extensions);
  }
} 