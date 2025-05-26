import { z } from "zod";
import {
  addProjectContext,
  getProjectContexts,
  getProjectInsights,
  getProjectById,
} from "../models/projectModel.js";
import { ProjectContextType } from "../types/index.js";
import fs from "fs/promises";
import path from "path";

// Get DATA_DIR from environment
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");

// Define the schema
export const projectContextSchema = z.object({
  action: z.enum([
    "add",
    "search",
    "analyze",
    "timeline",
    "export",
    "summary",
    "delete"
  ]).describe("Action to perform"),
  
  projectId: z.string().describe("Project ID"),
  
  // For add action
  contextType: z.enum(["learning", "decision", "problem", "solution", "reference", "note", "breakthrough"]).optional(),
  content: z.string().optional().describe("Context content"),
  tags: z.array(z.string()).optional().describe("Tags for the context"),
  metadata: z.record(z.any()).optional().describe("Additional metadata"),
  
  // For search action
  query: z.string().optional().describe("Search query"),
  contextTypes: z.array(z.enum(["learning", "decision", "problem", "solution", "reference", "note", "breakthrough"])).optional(),
  dateRange: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional(),
  
  // For analyze action
  analysisType: z.enum([
    "patterns",
    "problem_solution_pairs",
    "decisions",
    "knowledge_graph"
  ]).optional(),
  
  // For export action
  format: z.enum(["markdown", "json", "csv"]).optional().default("markdown"),
  outputFile: z.string().optional().describe("Output filename"),
  
  // For timeline
  timelineType: z.enum(["all", "breakthroughs", "decisions", "problems"]).optional().default("all"),
  
  // For delete action
  contextId: z.string().optional().describe("Specific context ID to delete"),
  deleteQuery: z.string().optional().describe("Query to find contexts to delete"),
  confirmDelete: z.boolean().optional().default(false).describe("Confirm deletion of multiple contexts"),
}).describe("Project context management tool");

/**
 * Project context management tool implementation
 */
async function projectContextImpl(params: z.infer<typeof projectContextSchema>) {
  const startTime = Date.now();
  
  try {
    // Debug log the environment
    if (process.env.MCP_DEBUG_LOGGING === "true") {
      console.error(`[DEBUG] projectContext - DATA_DIR: ${process.env.DATA_DIR}`);
      console.error(`[DEBUG] projectContext - Looking for project: ${params.projectId}`);
    }
    
    // Verify project exists
    const project = await getProjectById(params.projectId);
    if (!project) {
      if (process.env.MCP_DEBUG_LOGGING === "true") {
        console.error(`[DEBUG] projectContext - Project not found: ${params.projectId}`);
      }
      return {
        content: [{
          type: "text" as const,
          text: `❌ Project ${params.projectId} not found.`
        }]
      };
    }
    
    switch (params.action) {
      case "add":
        return await handleAddContext(params);
        
      case "search":
        return await handleSearchContext(params, project);
        
      case "analyze":
        return await handleAnalyzeContext(params, project);
        
      case "timeline":
        return await handleTimelineContext(params, project);
        
      case "export":
        return await handleExportContext(params, project);
        
      case "summary":
        return await handleSummaryContext(params, project);
        
      case "delete":
        return await handleDeleteContext(params, project);
        
      default:
        return {
          content: [{
            type: "text" as const,
            text: `❌ Unknown action: ${params.action}`
          }]
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Error logging removed - not available in current structure
    
    return {
      content: [{
        type: "text" as const,
        text: `Error in project context tool: ${errorMessage}`
      }]
    };
  }
}

// Handle add context (moved from project tool)
async function handleAddContext(params: z.infer<typeof projectContextSchema>) {
  if (!params.contextType || !params.content) {
    return {
      content: [{
        type: "text" as const,
        text: "❌ Context type and content are required."
      }]
    };
  }
  
  try {
    const context = await addProjectContext(params.projectId, {
      type: params.contextType as ProjectContextType,
      content: params.content,
      tags: params.tags,
      metadata: params.metadata,
    });
    
    if (!context) {
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to add context.`
        }]
      };
    }
    
    return {
      content: [{
        type: "text" as const,
        text: `✅ Context added successfully!\n\n` +
          `**Type:** ${context.type}\n` +
          `**ID:** ${context.id}\n` +
          `**Preview:** ${context.content.substring(0, 100)}${context.content.length > 100 ? '...' : ''}`
      }]
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{
        type: "text" as const,
        text: `❌ Failed to add context: ${errorMsg}`
      }]
    };
  }
}

// Handle search context
async function handleSearchContext(params: z.infer<typeof projectContextSchema>, project: any) {
  const contexts = await getProjectContexts(params.projectId);
  const insights = await getProjectInsights(params.projectId);
  
  if (process.env.MCP_DEBUG_LOGGING === "true") {
    console.error(`[DEBUG] handleSearchContext - Found ${contexts.length} contexts, ${insights.length} insights`);
  }
  
  const allContexts = [...contexts, ...insights.map(i => ({
    ...i,
    type: 'breakthrough' as const,
    content: `${i.title}\n\n${i.description}`,
    metadata: undefined // Insights don't have metadata
  }))];
  
  // Filter by type if specified
  let filtered = params.contextTypes 
    ? allContexts.filter(c => params.contextTypes!.includes(c.type as any))
    : allContexts;
  
  // Search by query if specified
  if (params.query) {
    const query = params.query.toLowerCase();
    filtered = filtered.filter(c => 
      c.content.toLowerCase().includes(query) ||
      c.tags?.some(t => t.toLowerCase().includes(query)) ||
      (c.metadata && JSON.stringify(c.metadata).toLowerCase().includes(query))
    );
  }
  
  // Filter by date range if specified
  if (params.dateRange) {
    if (params.dateRange.start) {
      const startDate = new Date(params.dateRange.start);
      filtered = filtered.filter(c => new Date(c.createdAt) >= startDate);
    }
    if (params.dateRange.end) {
      const endDate = new Date(params.dateRange.end);
      filtered = filtered.filter(c => new Date(c.createdAt) <= endDate);
    }
  }
  
  // Generate markdown output
  let output = `# Context Search Results\n\n`;
  output += `**Project:** ${project.name}\n`;
  output += `**Query:** ${params.query || 'All'}\n`;
  output += `**Types:** ${params.contextTypes?.join(', ') || 'All'}\n`;
  output += `**Results:** ${filtered.length} contexts found\n\n`;
  
  // Group by type
  const grouped = filtered.reduce((acc, ctx) => {
    if (!acc[ctx.type]) acc[ctx.type] = [];
    acc[ctx.type].push(ctx);
    return acc;
  }, {} as Record<string, typeof filtered>);
  
  for (const [type, contexts] of Object.entries(grouped)) {
    output += `## ${type.charAt(0).toUpperCase() + type.slice(1)}s (${contexts.length})\n\n`;
    
    for (const ctx of contexts) {
      output += `### ${new Date(ctx.createdAt).toISOString().split('T')[0]} - ${ctx.id}\n\n`;
      output += ctx.content + '\n\n';
      if (ctx.tags && ctx.tags.length > 0) {
        output += `**Tags:** ${ctx.tags.join(', ')}\n\n`;
      }
      output += '---\n\n';
    }
  }
  
  // Save to file
  const projectDir = path.join(PROJECTS_DIR, params.projectId);
  const outputPath = path.join(projectDir, 'context-search.md');
  await fs.writeFile(outputPath, output);
  
  return {
    content: [{
      type: "text" as const,
      text: `✅ Search complete! Found ${filtered.length} contexts.\n\n` +
        `Results saved to: ${outputPath}\n\n` +
        `Preview:\n${output.substring(0, 500)}...`
    }]
  };
}

// Handle analyze context
async function handleAnalyzeContext(params: z.infer<typeof projectContextSchema>, project: any) {
  const contexts = await getProjectContexts(params.projectId);
  const insights = await getProjectInsights(params.projectId);
  
  let output = `# Context Analysis: ${params.analysisType}\n\n`;
  output += `**Project:** ${project.name}\n`;
  output += `**Date:** ${new Date().toISOString().split('T')[0]}\n\n`;
  
  switch (params.analysisType) {
    case "problem_solution_pairs":
      output += await analyzeProblemSolutionPairs(contexts);
      break;
      
    case "decisions":
      output += await analyzeDecisions(contexts);
      break;
      
    case "patterns":
      output += await analyzePatterns(contexts, insights);
      break;
      
    case "knowledge_graph":
      output += await generateKnowledgeGraph(contexts, insights);
      break;
      
    default:
      output += "Analysis type not implemented yet.";
  }
  
  // Save to file
  const projectDir = path.join(PROJECTS_DIR, params.projectId);
  const outputPath = path.join(projectDir, `analysis-${params.analysisType}.md`);
  await fs.writeFile(outputPath, output);
  
  return {
    content: [{
      type: "text" as const,
      text: `✅ Analysis complete!\n\n` +
        `Results saved to: ${outputPath}\n\n` +
        `Preview:\n${output.substring(0, 500)}...`
    }]
  };
}

// Analyze problem-solution pairs
async function analyzeProblemSolutionPairs(contexts: any[]) {
  const problems = contexts.filter(c => c.type === 'problem');
  const solutions = contexts.filter(c => c.type === 'solution');
  
  let output = `## Problem-Solution Analysis\n\n`;
  output += `Found ${problems.length} problems and ${solutions.length} solutions.\n\n`;
  
  // Try to match problems with solutions based on proximity and content
  for (const problem of problems) {
    output += `### Problem: ${problem.content.substring(0, 100)}...\n`;
    output += `**Date:** ${new Date(problem.createdAt).toISOString().split('T')[0]}\n`;
    output += `**Full Context:**\n${problem.content}\n\n`;
    
    // Find solutions that came after this problem
    const relatedSolutions = solutions.filter(s => 
      new Date(s.createdAt) > new Date(problem.createdAt) &&
      // Simple content matching - could be improved with embeddings
      problem.content.split(' ').some((word: string) => 
        word.length > 4 && s.content.toLowerCase().includes(word.toLowerCase())
      )
    );
    
    if (relatedSolutions.length > 0) {
      output += `**Potential Solutions:**\n`;
      for (const solution of relatedSolutions) {
        output += `- ${new Date(solution.createdAt).toISOString().split('T')[0]}: ${solution.content.substring(0, 100)}...\n`;
      }
    } else {
      output += `**Status:** No solution found yet\n`;
    }
    output += '\n---\n\n';
  }
  
  // List unmatched solutions
  output += `## Solutions without explicit problems\n\n`;
  const unmatchedSolutions = solutions.filter(s => 
    !problems.some(p => 
      new Date(s.createdAt) > new Date(p.createdAt) &&
      p.content.split(' ').some((word: string) => 
        word.length > 4 && s.content.toLowerCase().includes(word.toLowerCase())
      )
    )
  );
  
  for (const solution of unmatchedSolutions) {
    output += `- ${new Date(solution.createdAt).toISOString().split('T')[0]}: ${solution.content.substring(0, 100)}...\n`;
  }
  
  return output;
}

// Analyze decisions
async function analyzeDecisions(contexts: any[]) {
  const decisions = contexts.filter(c => c.type === 'decision');
  
  let output = `## Decision Log\n\n`;
  output += `Total decisions made: ${decisions.length}\n\n`;
  
  // Sort by date
  decisions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  
  for (const decision of decisions) {
    output += `### ${new Date(decision.createdAt).toISOString().split('T')[0]}\n\n`;
    output += `**Decision:** ${decision.content}\n\n`;
    
    if (decision.tags && decision.tags.length > 0) {
      output += `**Categories:** ${decision.tags.join(', ')}\n\n`;
    }
    
    // Look for related contexts (problems that led to this decision)
    const relatedProblems = contexts.filter(c => 
      c.type === 'problem' &&
      new Date(c.createdAt) < new Date(decision.createdAt) &&
      decision.content.split(' ').some((word: string) => 
        word.length > 4 && c.content.toLowerCase().includes(word.toLowerCase())
      )
    );
    
    if (relatedProblems.length > 0) {
      output += `**Context:**\n`;
      for (const problem of relatedProblems) {
        output += `- Problem: ${problem.content.substring(0, 100)}...\n`;
      }
      output += '\n';
    }
    
    output += '---\n\n';
  }
  
  return output;
}

// Analyze patterns
async function analyzePatterns(contexts: any[], insights: any[]) {
  let output = `## Pattern Analysis\n\n`;
  
  // Tag frequency
  const tagCounts: Record<string, number> = {};
  contexts.forEach(c => {
    c.tags?.forEach((tag: string) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  
  output += `### Most Common Tags\n\n`;
  Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([tag, count]) => {
      output += `- **${tag}**: ${count as number} occurrences\n`;
    });
  
  // Context type distribution
  output += `\n### Context Type Distribution\n\n`;
  const typeCounts = contexts.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const typeEntries = Object.entries(typeCounts) as [string, number][];
  typeEntries.forEach(([type, count]) => {
    const percentage = ((count / contexts.length) * 100).toFixed(1);
    output += `- **${type}**: ${count} (${percentage}%)\n`;
  });
  
  // Temporal patterns
  output += `\n### Activity Timeline\n\n`;
  const monthCounts: Record<string, number> = {};
  contexts.forEach(c => {
    const month = new Date(c.createdAt).toISOString().substring(0, 7);
    monthCounts[month] = (monthCounts[month] || 0) + 1;
  });
  
  Object.entries(monthCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([month, count]) => {
      output += `- **${month}**: ${count} contexts\n`;
    });
  
  // Breakthrough impact distribution
  if (insights.length > 0) {
    output += `\n### Breakthrough Impact Levels\n\n`;
    const impactCounts: Record<string, number> = insights.reduce((acc, i) => {
      acc[i.impact] = (acc[i.impact] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    ['critical', 'high', 'medium', 'low'].forEach(level => {
      if (impactCounts[level]) {
        output += `- **${level}**: ${impactCounts[level]} insights\n`;
      }
    });
  }
  
  return output;
}

// Generate knowledge graph
async function generateKnowledgeGraph(contexts: any[], insights: any[]) {
  let output = `## Knowledge Graph\n\n`;
  output += `\`\`\`mermaid\ngraph TD\n`;
  
  // Create nodes for each context type
  const nodesByType: Record<string, string[]> = {};
  
  contexts.forEach((c, i) => {
    const nodeId = `${c.type}${i}`;
    const label = c.content.substring(0, 30).replace(/"/g, "'");
    
    if (!nodesByType[c.type]) nodesByType[c.type] = [];
    nodesByType[c.type].push(nodeId);
    
    output += `    ${nodeId}["${label}..."]\n`;
  });
  
  // Style nodes by type
  output += `\n    %% Styling\n`;
  output += `    classDef problem fill:#ff9999\n`;
  output += `    classDef solution fill:#99ff99\n`;
  output += `    classDef decision fill:#9999ff\n`;
  output += `    classDef learning fill:#ffff99\n`;
  output += `    classDef breakthrough fill:#ff99ff\n`;
  
  // Apply styles
  Object.entries(nodesByType).forEach(([type, nodes]) => {
    if (nodes.length > 0) {
      output += `    class ${nodes.join(',')} ${type}\n`;
    }
  });
  
  // Create edges based on temporal proximity and content similarity
  contexts.forEach((c1, i) => {
    contexts.forEach((c2, j) => {
      if (i < j && Math.abs(new Date(c1.createdAt).getTime() - new Date(c2.createdAt).getTime()) < 24 * 60 * 60 * 1000) {
        // If within 24 hours and share common words
        const words1 = c1.content.toLowerCase().split(' ').filter((w: string) => w.length > 4);
        const words2 = c2.content.toLowerCase().split(' ').filter((w: string) => w.length > 4);
        const commonWords = words1.filter((w: string) => words2.includes(w));
        
        if (commonWords.length > 2) {
          output += `    ${c1.type}${i} --> ${c2.type}${j}\n`;
        }
      }
    });
  });
  
  output += `\`\`\`\n\n`;
  
  // Add legend
  output += `### Legend\n\n`;
  output += `- 🔴 **Problems**: Issues encountered\n`;
  output += `- 🟢 **Solutions**: How problems were resolved\n`;
  output += `- 🔵 **Decisions**: Choices made\n`;
  output += `- 🟡 **Learnings**: Knowledge gained\n`;
  output += `- 🟣 **Breakthroughs**: Major insights\n`;
  
  return output;
}

// Handle timeline
async function handleTimelineContext(params: z.infer<typeof projectContextSchema>, project: any) {
  const contexts = await getProjectContexts(params.projectId);
  const insights = await getProjectInsights(params.projectId);
  
  let allItems: any[] = [...contexts];
  if (params.timelineType === 'all' || params.timelineType === 'breakthroughs') {
    allItems.push(...insights.map(i => ({
      ...i,
      type: 'breakthrough' as const,
      content: `${i.title}\n\n${i.description}`
    })));
  }
  
  // Filter by type
  if (params.timelineType !== 'all') {
    allItems = allItems.filter(item => {
      if (params.timelineType === 'breakthroughs') return item.type === 'breakthrough';
      if (params.timelineType === 'decisions') return item.type === 'decision';
      if (params.timelineType === 'problems') return item.type === 'problem';
      return true;
    });
  }
  
  // Sort by date
  allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  let output = `# Project Timeline: ${project.name}\n\n`;
  output += `**Type:** ${params.timelineType}\n`;
  output += `**Total Entries:** ${allItems.length}\n\n`;
  
  // Group by month
  const grouped = allItems.reduce((acc, item) => {
    const month = new Date(item.createdAt).toISOString().substring(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(item);
    return acc;
  }, {} as Record<string, typeof allItems>);
  
  const groupedEntries = Object.entries(grouped) as [string, typeof allItems][];
  for (const [month, items] of groupedEntries) {
    output += `## ${month}\n\n`;
    
    for (const item of items) {
      const date = new Date(item.createdAt).toISOString().split('T')[0];
      const iconMap: Record<string, string> = {
        problem: '🔴',
        solution: '🟢',
        decision: '🔵',
        learning: '🟡',
        breakthrough: '🟣',
        reference: '📚',
        note: '📝'
      };
      const icon = iconMap[item.type] || '⚪';
      
      output += `### ${date} ${icon} ${item.type.toUpperCase()}\n\n`;
      output += item.content + '\n\n';
      
      if (item.tags && item.tags.length > 0) {
        output += `**Tags:** ${item.tags.join(', ')}\n\n`;
      }
      
      output += '---\n\n';
    }
  }
  
  // Save to file
  const projectDir = path.join(PROJECTS_DIR, params.projectId);
  const outputPath = path.join(projectDir, `timeline-${params.timelineType}.md`);
  await fs.writeFile(outputPath, output);
  
  return {
    content: [{
      type: "text" as const,
      text: `✅ Timeline generated!\n\n` +
        `Results saved to: ${outputPath}\n\n` +
        `Total entries: ${allItems.length}`
    }]
  };
}

// Handle export
async function handleExportContext(params: z.infer<typeof projectContextSchema>, project: any) {
  const contexts = await getProjectContexts(params.projectId);
  const insights = await getProjectInsights(params.projectId);
  
  let filtered = [...contexts];
  if (params.contextTypes) {
    filtered = filtered.filter(c => params.contextTypes!.includes(c.type as any));
  }
  
  const filename = params.outputFile || `context-export-${new Date().toISOString().split('T')[0]}.${params.format}`;
  const projectDir = path.join(PROJECTS_DIR, params.projectId);
  const outputPath = path.join(projectDir, filename);
  
  switch (params.format) {
    case 'markdown':
      let mdOutput = `# ${project.name} - Context Export\n\n`;
      mdOutput += `**Exported:** ${new Date().toISOString()}\n`;
      mdOutput += `**Total Contexts:** ${filtered.length}\n\n`;
      
      for (const ctx of filtered) {
        mdOutput += `## ${ctx.type.toUpperCase()} - ${new Date(ctx.createdAt).toISOString()}\n\n`;
        mdOutput += ctx.content + '\n\n';
        if (ctx.tags && ctx.tags.length > 0) {
          mdOutput += `**Tags:** ${ctx.tags.join(', ')}\n\n`;
        }
        mdOutput += '---\n\n';
      }
      
      await fs.writeFile(outputPath, mdOutput);
      break;
      
    case 'json':
      await fs.writeFile(outputPath, JSON.stringify({ project, contexts: filtered, insights }, null, 2));
      break;
      
    case 'csv':
      let csvOutput = 'ID,Type,Date,Content,Tags\n';
      for (const ctx of filtered) {
        const content = ctx.content.replace(/"/g, '""').replace(/\n/g, ' ');
        const tags = ctx.tags?.join(';') || '';
        csvOutput += `"${ctx.id}","${ctx.type}","${ctx.createdAt}","${content}","${tags}"\n`;
      }
      await fs.writeFile(outputPath, csvOutput);
      break;
  }
  
  return {
    content: [{
      type: "text" as const,
      text: `✅ Export complete!\n\n` +
        `Format: ${params.format}\n` +
        `Contexts exported: ${filtered.length}\n` +
        `File saved to: ${outputPath}`
    }]
  };
}

// Handle summary
async function handleSummaryContext(params: z.infer<typeof projectContextSchema>, project: any) {
  const contexts = await getProjectContexts(params.projectId);
  const insights = await getProjectInsights(params.projectId);
  
  let output = `# ${project.name} - Context Summary\n\n`;
  output += `**Generated:** ${new Date().toISOString()}\n\n`;
  
  // Overview stats
  output += `## Overview\n\n`;
  output += `- **Total Contexts:** ${contexts.length}\n`;
  output += `- **Total Insights:** ${insights.length}\n`;
  output += `- **Date Range:** ${contexts.length > 0 ? `${new Date(contexts[contexts.length - 1].createdAt).toISOString().split('T')[0]} to ${new Date(contexts[0].createdAt).toISOString().split('T')[0]}` : 'N/A'}\n\n`;
  
  // Context breakdown
  output += `## Context Breakdown\n\n`;
  const typeCounts = contexts.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  Object.entries(typeCounts).forEach(([type, count]) => {
    output += `- **${type}**: ${count}\n`;
  });
  
  // Recent highlights
  output += `\n## Recent Highlights\n\n`;
  
  // Recent breakthroughs
  const recentBreakthroughs = insights.slice(0, 3);
  if (recentBreakthroughs.length > 0) {
    output += `### Recent Breakthroughs\n\n`;
    for (const insight of recentBreakthroughs) {
      output += `- **${insight.title}** (${insight.impact} impact)\n`;
      output += `  ${insight.description.substring(0, 100)}...\n\n`;
    }
  }
  
  // Recent problems
  const recentProblems = contexts.filter(c => c.type === 'problem').slice(0, 3);
  if (recentProblems.length > 0) {
    output += `### Recent Problems\n\n`;
    for (const problem of recentProblems) {
      output += `- ${problem.content.substring(0, 100)}...\n`;
    }
    output += '\n';
  }
  
  // Recent decisions
  const recentDecisions = contexts.filter(c => c.type === 'decision').slice(0, 3);
  if (recentDecisions.length > 0) {
    output += `### Recent Decisions\n\n`;
    for (const decision of recentDecisions) {
      output += `- ${decision.content.substring(0, 100)}...\n`;
    }
    output += '\n';
  }
  
  // Tag cloud
  const allTags: string[] = [];
  contexts.forEach(c => {
    if (c.tags) allTags.push(...c.tags);
  });
  
  if (allTags.length > 0) {
    output += `## Top Tags\n\n`;
    const tagCounts = allTags.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([tag, count]) => {
        output += `- **${tag}**: ${count} uses\n`;
      });
  }
  
  // Save to file
  const projectDir = path.join(PROJECTS_DIR, params.projectId);
  const outputPath = path.join(projectDir, 'context-summary.md');
  await fs.writeFile(outputPath, output);
  
  return {
    content: [{
      type: "text" as const,
      text: `✅ Summary generated!\n\n` +
        `Results saved to: ${outputPath}\n\n` +
        output.substring(0, 500) + '...'
    }]
  };
}

// Handle delete context
async function handleDeleteContext(params: z.infer<typeof projectContextSchema>, project: any) {
  const projectDir = path.join(PROJECTS_DIR, params.projectId);
  const projectFile = path.join(projectDir, 'project.json');
  
  try {
    // Read current project data
    const projectData = JSON.parse(await fs.readFile(projectFile, 'utf-8'));
    
    if (!projectData.contexts || projectData.contexts.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `❌ No contexts found in project.`
        }]
      };
    }
    
    let contextsToDelete: any[] = [];
    let remainingContexts: any[] = [];
    
    if (params.contextId) {
      // Delete specific context by ID
      contextsToDelete = projectData.contexts.filter((c: any) => c.id === params.contextId);
      remainingContexts = projectData.contexts.filter((c: any) => c.id !== params.contextId);
      
      if (contextsToDelete.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ Context with ID ${params.contextId} not found.`
          }]
        };
      }
    } else if (params.deleteQuery) {
      // Delete contexts matching query
      const query = params.deleteQuery.toLowerCase();
      contextsToDelete = projectData.contexts.filter((c: any) => 
        c.content.toLowerCase().includes(query) ||
        c.tags?.some((t: string) => t.toLowerCase().includes(query)) ||
        (c.metadata && JSON.stringify(c.metadata).toLowerCase().includes(query))
      );
      remainingContexts = projectData.contexts.filter((c: any) => 
        !c.content.toLowerCase().includes(query) &&
        !c.tags?.some((t: string) => t.toLowerCase().includes(query)) &&
        !(c.metadata && JSON.stringify(c.metadata).toLowerCase().includes(query))
      );
      
      if (contextsToDelete.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ No contexts found matching query: "${params.deleteQuery}"`
          }]
        };
      }
      
      // Require confirmation for multiple deletions
      if (contextsToDelete.length > 1 && !params.confirmDelete) {
        let preview = `⚠️ Found ${contextsToDelete.length} contexts to delete:\n\n`;
        for (const ctx of contextsToDelete.slice(0, 5)) {
          preview += `- **${ctx.type}** (${ctx.id}): ${ctx.content.substring(0, 50)}...\n`;
        }
        if (contextsToDelete.length > 5) {
          preview += `- ... and ${contextsToDelete.length - 5} more\n`;
        }
        preview += `\nTo confirm deletion, run again with confirmDelete: true`;
        
        return {
          content: [{
            type: "text" as const,
            text: preview
          }]
        };
      }
    } else {
      return {
        content: [{
          type: "text" as const,
          text: `❌ Please provide either contextId or deleteQuery parameter.`
        }]
      };
    }
    
    // Update project data
    projectData.contexts = remainingContexts;
    projectData.updatedAt = new Date().toISOString();
    
    // Save updated project
    await fs.writeFile(projectFile, JSON.stringify(projectData, null, 2));
    
    // Delete associated context files
    for (const ctx of contextsToDelete) {
      const contextFile = path.join(projectDir, `contexts/${ctx.id}.json`);
      try {
        await fs.unlink(contextFile);
      } catch (error) {
        // File might not exist, that's okay
      }
    }
    
    // Generate deletion report
    let report = `✅ Successfully deleted ${contextsToDelete.length} context(s)!\n\n`;
    report += `## Deleted Contexts\n\n`;
    
    for (const ctx of contextsToDelete) {
      report += `### ${ctx.type} - ${ctx.id}\n`;
      report += `**Date:** ${new Date(ctx.createdAt).toISOString().split('T')[0]}\n`;
      report += `**Content:** ${ctx.content.substring(0, 200)}...\n`;
      if (ctx.tags && ctx.tags.length > 0) {
        report += `**Tags:** ${ctx.tags.join(', ')}\n`;
      }
      report += `\n---\n\n`;
    }
    
    report += `\n## Summary\n\n`;
    report += `- **Contexts deleted:** ${contextsToDelete.length}\n`;
    report += `- **Contexts remaining:** ${remainingContexts.length}\n`;
    
    // Save deletion report
    const reportPath = path.join(projectDir, `deletion-report-${new Date().toISOString().split('T')[0]}.md`);
    await fs.writeFile(reportPath, report);
    
    return {
      content: [{
        type: "text" as const,
        text: report
      }]
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{
        type: "text" as const,
        text: `❌ Failed to delete context: ${errorMsg}`
      }]
    };
  }
}

// Export the implementation directly
export const projectContext = projectContextImpl; 