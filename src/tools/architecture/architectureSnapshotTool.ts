import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { ArchitectureAnalyzer } from '../../tools/architectureSnapshot/architectureAnalyzer.js';
import { ProjectSnapshot } from '../../types/architectureSnapshot.js';

// Get DATA_DIR from environment
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'architecture-snapshots');

export const architectureSnapshotSchema = z.object({
  action: z.enum(['create', 'update', 'compare', 'list']).describe('Action to perform'),
  projectPath: z.string().optional().describe('Path to the project to analyze (defaults to current directory)'),
  projectId: z.string().optional().describe('Project ID for storing snapshots'),
  previousSnapshotId: z.string().optional().describe('ID of previous snapshot for comparison'),
  options: z.object({
    depth: z.enum(['shallow', 'deep']).optional().default('deep'),
    includeNodeModules: z.boolean().optional().default(false),
    outputFormat: z.enum(['markdown', 'json', 'both']).optional().default('both')
  }).optional()
}).describe('Architecture snapshot tool - analyze and document codebase structure');

export async function architectureSnapshot(params: z.infer<typeof architectureSnapshotSchema>) {
  const analyzer = new ArchitectureAnalyzer();
  
  try {
    // Smart detection: if action is 'create', check if we should suggest 'update' instead
    if (params.action === 'create') {
      const detectionResult = await detectExistingSnapshots(params);
      if (detectionResult.hasExisting) {
        return {
          content: [{
            type: 'text' as const,
            text: detectionResult.message
          }]
        };
      }
    }
    
    switch (params.action) {
      case 'create':
        return await createSnapshot(analyzer, params);
        
      case 'update':
        return await updateSnapshot(analyzer, params);
        
      case 'compare':
        return await compareSnapshots(params);
        
      case 'list':
        return await listSnapshots(params);
        
      default:
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Unknown action: ${params.action}`
          }]
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `❌ Error in architecture snapshot: ${errorMessage}`
      }]
    };
  }
}

async function detectExistingSnapshots(params: z.infer<typeof architectureSnapshotSchema>): Promise<{
  hasExisting: boolean;
  message: string;
}> {
  const projectPath = params.projectPath || process.cwd();
  const projectId = params.projectId || path.basename(projectPath);
  const projectSnapshotDir = path.join(SNAPSHOTS_DIR, projectId);
  
  try {
    // Check if the project snapshot directory exists
    await fs.access(projectSnapshotDir);
    
    // Check for metadata.json (our tool's signature file)
    const metadataPath = path.join(projectSnapshotDir, 'metadata.json');
    const metadata = await loadMetadata(metadataPath);
    
    if (metadata.snapshots && metadata.snapshots.length > 0) {
      const latestSnapshot = metadata.snapshots[metadata.snapshots.length - 1];
      const snapshotDate = new Date(latestSnapshot.timestamp).toLocaleString();
      
      return {
        hasExisting: true,
        message: `📊 Found existing architecture snapshots for project "${projectId}"

**Latest snapshot:** ${snapshotDate}
**Snapshot ID:** ${latestSnapshot.id}
**Total snapshots:** ${metadata.snapshots.length}

It looks like this project already has architecture snapshots created by this tool.

**Recommended action:** Use \`update\` to create a new snapshot and compare changes:
\`\`\`
architecture_snapshot action=update projectId=${projectId}
\`\`\`

If you want to start fresh instead, you can:
1. Delete existing snapshots: \`rm -rf ${projectSnapshotDir}\`
2. Then run: \`architecture_snapshot action=create projectId=${projectId}\`

Or view existing snapshots: \`architecture_snapshot action=list projectId=${projectId}\``
      };
    }
  } catch (error) {
    // Directory doesn't exist or no metadata - this is fine, proceed with create
  }
  
  return {
    hasExisting: false,
    message: ''
  };
}

async function createSnapshot(analyzer: ArchitectureAnalyzer, params: z.infer<typeof architectureSnapshotSchema>) {
  const projectPath = params.projectPath || process.cwd();
  const projectId = params.projectId || path.basename(projectPath);
  
  // Analyze the project
  const snapshot = await analyzer.analyze(projectPath, {
    depth: params.options?.depth,
    includeNodeModules: params.options?.includeNodeModules
  });
  
  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDir = path.join(SNAPSHOTS_DIR, projectId, timestamp);
  await fs.mkdir(snapshotDir, { recursive: true });
  
  // Generate and save report
  const reportPath = await analyzer.generateReport(snapshot, snapshotDir);
  
  // Save metadata
  const metadataPath = path.join(SNAPSHOTS_DIR, projectId, 'metadata.json');
  const metadata = await loadMetadata(metadataPath);
  metadata.snapshots.push({
    id: snapshot.id,
    timestamp: snapshot.timestamp,
    version: snapshot.version,
    path: snapshotDir
  });
  metadata.latest = snapshot.id;
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  
  return {
    content: [{
      type: 'text' as const,
      text: `✅ Architecture snapshot created successfully!

**Project:** ${snapshot.projectName}
**Snapshot ID:** ${snapshot.id}
**Timestamp:** ${snapshot.timestamp.toLocaleString()}

**Summary:**
- Total Files: ${snapshot.structure.totalFiles}
- Total Directories: ${snapshot.structure.totalDirectories}
- Dependencies: ${snapshot.dependencies.totalCount}
- Primary Language: ${snapshot.metadata.languages[0]?.name || 'Not detected'}

**Files Generated:**
- Architecture Report: ${reportPath}
- JSON Snapshot: ${reportPath.replace('.md', '.json')}

Use the snapshot ID for future comparisons or updates.`
    }]
  };
}

async function updateSnapshot(analyzer: ArchitectureAnalyzer, params: z.infer<typeof architectureSnapshotSchema>) {
  const projectPath = params.projectPath || process.cwd();
  const projectId = params.projectId || path.basename(projectPath);
  
  // Load previous snapshot metadata
  const metadataPath = path.join(SNAPSHOTS_DIR, projectId, 'metadata.json');
  const metadata = await loadMetadata(metadataPath);
  
  if (metadata.snapshots.length === 0) {
    return await createSnapshot(analyzer, params);
  }
  
  // Get the latest snapshot
  const latestSnapshot = metadata.snapshots[metadata.snapshots.length - 1];
  const previousSnapshotPath = path.join(latestSnapshot.path, 'architecture.json');
  const previousSnapshot: ProjectSnapshot = JSON.parse(await fs.readFile(previousSnapshotPath, 'utf-8'));
  
  // Create new snapshot
  const newSnapshot = await analyzer.analyze(projectPath, {
    depth: params.options?.depth,
    includeNodeModules: params.options?.includeNodeModules
  });
  
  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDir = path.join(SNAPSHOTS_DIR, projectId, timestamp);
  await fs.mkdir(snapshotDir, { recursive: true });
  
  // Generate report
  const reportPath = await analyzer.generateReport(newSnapshot, snapshotDir);
  
  // Generate comparison report
  const comparison = await compareSnapshotObjects(previousSnapshot, newSnapshot);
  const comparisonPath = path.join(snapshotDir, 'comparison.md');
  await fs.writeFile(comparisonPath, comparison);
  
  // Update metadata
  metadata.snapshots.push({
    id: newSnapshot.id,
    timestamp: newSnapshot.timestamp,
    version: newSnapshot.version,
    path: snapshotDir,
    previousId: previousSnapshot.id
  });
  metadata.latest = newSnapshot.id;
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  
  return {
    content: [{
      type: 'text' as const,
      text: `✅ Architecture snapshot updated successfully!

**Project:** ${newSnapshot.projectName}
**New Snapshot ID:** ${newSnapshot.id}
**Previous Snapshot ID:** ${previousSnapshot.id}
**Timestamp:** ${newSnapshot.timestamp.toLocaleString()}

**Changes Detected:**
${comparison.substring(0, 500)}...

**Files Generated:**
- Architecture Report: ${reportPath}
- JSON Snapshot: ${reportPath.replace('.md', '.json')}
- Comparison Report: ${comparisonPath}

View the comparison report for detailed changes.`
    }]
  };
}

async function compareSnapshots(params: z.infer<typeof architectureSnapshotSchema>) {
  if (!params.projectId || !params.previousSnapshotId) {
    return {
      content: [{
        type: 'text' as const,
        text: '❌ Project ID and previous snapshot ID are required for comparison.'
      }]
    };
  }
  
  // This would load two snapshots and generate a detailed comparison
  // For now, returning a placeholder
  return {
    content: [{
      type: 'text' as const,
      text: '🚧 Snapshot comparison feature is under development.'
    }]
  };
}

async function listSnapshots(params: z.infer<typeof architectureSnapshotSchema>) {
  const projectId = params.projectId;
  
  if (!projectId) {
    // List all projects with snapshots
    try {
      const projects = await fs.readdir(SNAPSHOTS_DIR);
      let output = '# Architecture Snapshots\n\n';
      
      for (const project of projects) {
        const metadataPath = path.join(SNAPSHOTS_DIR, project, 'metadata.json');
        try {
          const metadata = await loadMetadata(metadataPath);
          output += `## ${project}\n`;
          output += `- Snapshots: ${metadata.snapshots.length}\n`;
          output += `- Latest: ${metadata.latest || 'None'}\n\n`;
        } catch {
          // Skip invalid directories
        }
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: output
        }]
      };
    } catch {
      return {
        content: [{
          type: 'text' as const,
          text: 'No architecture snapshots found.'
        }]
      };
    }
  } else {
    // List snapshots for specific project
    const metadataPath = path.join(SNAPSHOTS_DIR, projectId, 'metadata.json');
    const metadata = await loadMetadata(metadataPath);
    
    let output = `# Architecture Snapshots for ${projectId}\n\n`;
    output += `Total Snapshots: ${metadata.snapshots.length}\n\n`;
    
    for (const snapshot of metadata.snapshots.reverse()) {
      output += `## ${new Date(snapshot.timestamp).toLocaleString()}\n`;
      output += `- ID: ${snapshot.id}\n`;
      output += `- Version: ${snapshot.version}\n`;
      if (snapshot.previousId) {
        output += `- Previous: ${snapshot.previousId}\n`;
      }
      output += `- Path: ${snapshot.path}\n\n`;
    }
    
    return {
      content: [{
        type: 'text' as const,
        text: output
      }]
    };
  }
}

async function loadMetadata(metadataPath: string): Promise<any> {
  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      snapshots: [],
      latest: null
    };
  }
}

async function compareSnapshotObjects(previous: ProjectSnapshot, current: ProjectSnapshot): Promise<string> {
  let output = '# Architecture Changes\n\n';
  
  // Compare metadata
  output += '## Metadata Changes\n';
  if (previous.metadata.version !== current.metadata.version) {
    output += `- Version: ${previous.metadata.version} → ${current.metadata.version}\n`;
  }
  
  // Compare structure
  output += '\n## Structure Changes\n';
  output += `- Files: ${previous.structure.totalFiles} → ${current.structure.totalFiles} (${current.structure.totalFiles - previous.structure.totalFiles > 0 ? '+' : ''}${current.structure.totalFiles - previous.structure.totalFiles})\n`;
  output += `- Directories: ${previous.structure.totalDirectories} → ${current.structure.totalDirectories} (${current.structure.totalDirectories - previous.structure.totalDirectories > 0 ? '+' : ''}${current.structure.totalDirectories - previous.structure.totalDirectories})\n`;
  
  // Compare dependencies
  output += '\n## Dependency Changes\n';
  output += `- Total: ${previous.dependencies.totalCount} → ${current.dependencies.totalCount} (${current.dependencies.totalCount - previous.dependencies.totalCount > 0 ? '+' : ''}${current.dependencies.totalCount - previous.dependencies.totalCount})\n`;
  
  // Add more detailed comparisons in a full implementation
  
  return output;
} 