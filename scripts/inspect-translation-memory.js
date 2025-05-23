#!/usr/bin/env node

/**
 * Script to inspect persisted translation memory data
 * Shows what's stored and how the learning system works
 * 
 * To run: node scripts/inspect-translation-memory.js
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function formatDate(date) {
  return new Date(date).toLocaleString();
}

async function inspectTranslationMemory() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const memoryDir = path.join(dataDir, 'translation_memory');
  
  log('\n📁 Translation Memory Inspector', 'bright');
  console.log('='.repeat(60));
  
  log(`\nData directory: ${dataDir}`, 'cyan');
  log(`Memory directory: ${memoryDir}`, 'cyan');
  
  try {
    await fs.access(memoryDir);
  } catch {
    log('\n❌ No translation memory directory found!', 'red');
    log('Run some translations first to create memory.', 'yellow');
    return;
  }
  
  // List all files
  const files = await fs.readdir(memoryDir);
  log(`\nFound ${files.length} files/directories:`, 'green');
  
  // Separate memory files and dialogs
  const memoryFiles = files.filter(f => f.endsWith('.json') && f.includes('_to_'));
  const hasDialogs = files.includes('dialogs');
  
  // Inspect each memory file
  for (const file of memoryFiles) {
    console.log('\n' + '-'.repeat(60));
    log(`\n📄 ${file}`, 'bright');
    
    const filePath = path.join(memoryDir, file);
    const data = await fs.readFile(filePath, 'utf-8');
    const memory = JSON.parse(data);
    
    log(`Total entries: ${memory.length}`, 'green');
    
    if (memory.length > 0) {
      // Statistics
      const totalUsage = memory.reduce((sum, entry) => sum + entry.usageCount, 0);
      const avgConfidence = memory.reduce((sum, entry) => sum + entry.confidence, 0) / memory.length;
      const domains = [...new Set(memory.map(e => e.domain || 'general'))];
      
      log(`\nStatistics:`, 'yellow');
      log(`  • Total usage count: ${totalUsage}`, 'cyan');
      log(`  • Average confidence: ${(avgConfidence * 100).toFixed(1)}%`, 'cyan');
      log(`  • Domains covered: ${domains.join(', ')}`, 'cyan');
      
      // Most used translations
      log(`\nTop 5 Most Used Translations:`, 'yellow');
      memory
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 5)
        .forEach((entry, index) => {
          log(`\n  ${index + 1}. "${entry.sourceText}" → "${entry.targetText}"`, 'green');
          log(`     Domain: ${entry.domain || 'general'} | Used: ${entry.usageCount} times | Confidence: ${(entry.confidence * 100).toFixed(0)}%`, 'dim');
          if (entry.context) {
            log(`     Context: ${entry.context}`, 'dim');
          }
          log(`     Created: ${formatDate(entry.created)} | Last used: ${formatDate(entry.lastUsed)}`, 'dim');
        });
      
      // Recent translations
      log(`\n\nMost Recent Translations:`, 'yellow');
      memory
        .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
        .slice(0, 3)
        .forEach((entry) => {
          log(`\n  • "${entry.sourceText}" → "${entry.targetText}"`, 'green');
          log(`    Last used: ${formatDate(entry.lastUsed)}`, 'dim');
        });
      
      // Domain breakdown
      log(`\n\nTranslations by Domain:`, 'yellow');
      const domainStats = {};
      memory.forEach(entry => {
        const d = entry.domain || 'general';
        if (!domainStats[d]) domainStats[d] = 0;
        domainStats[d]++;
      });
      
      Object.entries(domainStats)
        .sort((a, b) => b[1] - a[1])
        .forEach(([domain, count]) => {
          log(`  • ${domain}: ${count} translations`, 'cyan');
        });
    }
  }
  
  // Check for dialogs
  if (hasDialogs) {
    console.log('\n' + '-'.repeat(60));
    log('\n💬 Dialog History', 'bright');
    
    const dialogDir = path.join(memoryDir, 'dialogs');
    try {
      const dialogFiles = await fs.readdir(dialogDir);
      log(`Found ${dialogFiles.length} dialog(s)`, 'green');
      
      for (const dialogFile of dialogFiles.slice(0, 3)) { // Show first 3
        const dialogPath = path.join(dialogDir, dialogFile);
        const dialogData = await fs.readFile(dialogPath, 'utf-8');
        const dialog = JSON.parse(dialogData);
        
        log(`\n  Dialog: ${dialogFile}`, 'yellow');
        log(`  Status: ${dialog.status}`, 'cyan');
        log(`  Created: ${formatDate(dialog.created)}`, 'dim');
        log(`  Content: "${dialog.sourceContent}"`, 'dim');
        if (dialog.finalTranslation) {
          log(`  Final translation: "${dialog.finalTranslation}"`, 'green');
        }
      }
    } catch (error) {
      log('  No dialogs found', 'dim');
    }
  }
  
  // Storage size
  console.log('\n' + '-'.repeat(60));
  log('\n💾 Storage Analysis', 'bright');
  
  let totalSize = 0;
  for (const file of memoryFiles) {
    const stats = await fs.stat(path.join(memoryDir, file));
    totalSize += stats.size;
    log(`  ${file}: ${(stats.size / 1024).toFixed(2)} KB`, 'cyan');
  }
  
  log(`\nTotal memory size: ${(totalSize / 1024).toFixed(2)} KB`, 'green');
  
  // Tips
  console.log('\n' + '='.repeat(60));
  log('\n💡 Tips:', 'bright');
  log('• Translation memory improves over time with usage', 'yellow');
  log('• Higher usage count = higher priority in suggestions', 'yellow');
  log('• Context and domain help disambiguate similar terms', 'yellow');
  log('• Dialogs are preserved for learning from clarifications', 'yellow');
  log('• Memory persists between MCP server restarts', 'yellow');
}

// Run inspection
inspectTranslationMemory().catch(console.error); 