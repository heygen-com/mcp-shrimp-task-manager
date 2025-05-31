import { z } from 'zod';
import { queryMemories, getMemoryStats } from '../models/memoryModel.js';
import { MemoryType, Memory, MemoryStats } from '../types/memory.js';
import { calculateImportanceScore } from '../utils/memoryUtils.js';

// Schema for memory analytics
export const memoryAnalyticsSchema = z.object({
  timeRange: z.enum(['week', 'month', 'quarter', 'year', 'all']).default('month'),
  projectId: z.string().optional(),
  groupBy: z.enum(['type', 'project', 'tag', 'week']).default('type'),
  includeArchived: z.boolean().default(false)
});

// Generate memory analytics
export async function generateMemoryAnalytics(params: z.infer<typeof memoryAnalyticsSchema>) {
  try {
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    
    switch (params.timeRange) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'all':
        startDate.setTime(0); // Beginning of time
        break;
    }
    
    // Query memories
    const memories = await queryMemories({
      filters: {
        projectId: params.projectId,
        dateRange: { start: startDate, end: now },
        archived: params.includeArchived ? undefined : false
      }
    });
    
    // Get global stats
    const stats = await getMemoryStats();
    
    // Calculate analytics
    const analytics = {
      overview: {
        totalMemories: memories.length,
        timeRange: params.timeRange,
        dateRange: {
          start: startDate.toISOString(),
          end: now.toISOString()
        }
      },
      byType: calculateByType(memories),
      byImportance: calculateByImportance(memories),
      timeline: calculateTimeline(memories, params.groupBy),
      insights: generateInsights(memories),
      recommendations: generateRecommendations(memories, stats)
    };
    
    // Format output
    let output = `# Memory Analytics Report\n\n`;
    output += `**Time Range:** ${params.timeRange} (${startDate.toLocaleDateString()} - ${now.toLocaleDateString()})\n`;
    if (params.projectId) {
      output += `**Project:** ${params.projectId}\n`;
    }
    output += `**Total Memories:** ${analytics.overview.totalMemories}\n\n`;
    
    // Memory type distribution
    output += `## Memory Distribution by Type\n\n`;
    output += generateAsciiChart(analytics.byType);
    output += '\n';
    
    // Importance distribution
    output += `## Importance Score Distribution\n\n`;
    for (const [range, count] of Object.entries(analytics.byImportance)) {
      const percentage = ((count / memories.length) * 100).toFixed(1);
      output += `- ${range}: ${count} memories (${percentage}%)\n`;
    }
    output += '\n';
    
    // Timeline
    output += `## Memory Creation Timeline\n\n`;
    for (const [period, data] of Object.entries(analytics.timeline)) {
      output += `**${period}**\n`;
      for (const [key, count] of Object.entries(data)) {
        output += `  - ${key}: ${count}\n`;
      }
    }
    output += '\n';
    
    // Insights
    output += `## Key Insights\n\n`;
    for (const insight of analytics.insights) {
      output += `- ${insight}\n`;
    }
    output += '\n';
    
    // Recommendations
    output += `## Recommendations\n\n`;
    for (const recommendation of analytics.recommendations) {
      output += `- ${recommendation}\n`;
    }
    
    return {
      content: [{
        type: "text" as const,
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error generating analytics: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Calculate distribution by memory type
function calculateByType(memories: Memory[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  
  for (const memory of memories) {
    distribution[memory.type] = (distribution[memory.type] || 0) + 1;
  }
  
  return distribution;
}

// Calculate distribution by importance score
function calculateByImportance(memories: Memory[]): Record<string, number> {
  const ranges = {
    'Very High (0.8-1.0)': 0,
    'High (0.6-0.8)': 0,
    'Medium (0.4-0.6)': 0,
    'Low (0.2-0.4)': 0,
    'Very Low (0-0.2)': 0
  };
  
  for (const memory of memories) {
    const score = calculateImportanceScore(memory);
    
    if (score >= 0.8) ranges['Very High (0.8-1.0)']++;
    else if (score >= 0.6) ranges['High (0.6-0.8)']++;
    else if (score >= 0.4) ranges['Medium (0.4-0.6)']++;
    else if (score >= 0.2) ranges['Low (0.2-0.4)']++;
    else ranges['Very Low (0-0.2)']++;
  }
  
  return ranges;
}

// Calculate timeline distribution
function calculateTimeline(memories: Memory[], groupBy: string): Record<string, Record<string, number>> {
  const timeline: Record<string, Record<string, number>> = {};
  
  for (const memory of memories) {
    const date = new Date(memory.created);
    let key: string;
    
    if (groupBy === 'week') {
      // Get week number
      const weekNum = getWeekNumber(date);
      key = `Week ${weekNum} (${date.getFullYear()})`;
    } else {
      // Monthly grouping
      key = `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
    }
    
    if (!timeline[key]) {
      timeline[key] = {};
    }
    
    const subKey = groupBy === 'type' ? memory.type : 
                   groupBy === 'project' ? (memory.projectId || 'Global') :
                   groupBy === 'tag' ? (memory.tags[0] || 'Untagged') :
                   'Total';
    
    timeline[key][subKey] = (timeline[key][subKey] || 0) + 1;
  }
  
  return timeline;
}

// Get week number
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Generate insights from memory data
function generateInsights(memories: Memory[]): string[] {
  const insights: string[] = [];
  
  // Most active memory type
  const typeCount = calculateByType(memories);
  const mostActiveType = Object.entries(typeCount)
    .sort(([, a], [, b]) => b - a)[0];
  
  if (mostActiveType) {
    insights.push(`Most recorded memory type: ${mostActiveType[0]} (${mostActiveType[1]} memories)`);
  }
  
  // Average memories per day
  if (memories.length > 0) {
    const oldestMemory = memories.reduce((oldest, m) => 
      new Date(m.created) < new Date(oldest.created) ? m : oldest
    );
    const daysSinceFirst = Math.ceil((Date.now() - new Date(oldestMemory.created).getTime()) / (1000 * 60 * 60 * 24));
    const avgPerDay = (memories.length / daysSinceFirst).toFixed(2);
    insights.push(`Average memories per day: ${avgPerDay}`);
  }
  
  // Most accessed memory
  const mostAccessed = memories.reduce((most, m) => 
    m.accessCount > (most?.accessCount || 0) ? m : most
  , null as Memory | null);
  
  if (mostAccessed) {
    insights.push(`Most accessed memory: "${mostAccessed.summary}" (${mostAccessed.accessCount} accesses)`);
  }
  
  // Tag analysis
  const tagFrequency: Record<string, number> = {};
  memories.forEach(m => {
    m.tags.forEach((tag: string) => {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
    });
  });
  
  const topTags = Object.entries(tagFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  
  if (topTags.length > 0) {
    insights.push(`Top tags: ${topTags.map(([tag, count]) => `${tag} (${count})`).join(', ')}`);
  }
  
  return insights;
}

// Generate recommendations
function generateRecommendations(memories: Memory[], stats: MemoryStats): string[] {
  const recommendations: string[] = [];
  
  // Check for old memories that should be archived
  const oldMemories = memories.filter(m => {
    const ageInDays = (Date.now() - new Date(m.created).getTime()) / (1000 * 60 * 60 * 24);
    return ageInDays > 90 && m.relevanceScore < 0.3 && !m.archived;
  });
  
  if (oldMemories.length > 0) {
    recommendations.push(`Consider archiving ${oldMemories.length} old memories with low relevance scores`);
  }
  
  // Check for memory types that are underrepresented
  const typeCount = calculateByType(memories);
  const allTypes = Object.values(MemoryType);
  const missingTypes = allTypes.filter(type => !typeCount[type] || typeCount[type] < 2);
  
  if (missingTypes.length > 0) {
    recommendations.push(`Consider recording more ${missingTypes.join(', ')} type memories for better coverage`);
  }
  
  // Check for memories without tags
  const untaggedCount = memories.filter(m => m.tags.length === 0).length;
  if (untaggedCount > 5) {
    recommendations.push(`${untaggedCount} memories lack tags - consider adding tags for better organization`);
  }
  
  // Performance recommendation
  if (stats.totalMemories > 1000 && !memories.some(m => m.archived)) {
    recommendations.push(`With ${stats.totalMemories} total memories, consider running maintenance to archive old entries`);
  }
  
  return recommendations;
}

// Generate ASCII chart for distribution
function generateAsciiChart(distribution: Record<string, number>): string {
  const maxCount = Math.max(...Object.values(distribution));
  const barLength = 30;
  let chart = '';
  
  for (const [type, count] of Object.entries(distribution)) {
    const percentage = maxCount > 0 ? (count / maxCount) : 0;
    const bars = '█'.repeat(Math.round(percentage * barLength));
    const spaces = ' '.repeat(barLength - bars.length);
    
    chart += `${type.padEnd(20)} ${bars}${spaces} ${count}\n`;
  }
  
  return chart;
} 