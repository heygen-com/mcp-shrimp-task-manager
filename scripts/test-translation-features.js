#!/usr/bin/env node

/**
 * Comprehensive test script for the translation tool
 * This demonstrates ALL features including persistence, dialog, and memory
 * 
 * To run: node scripts/test-translation-features.js
 */

import 'dotenv/config';
import { translateContent } from '../dist/tools/translationTool.js';
import path from 'path';
import fs from 'fs/promises';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

async function checkDataDir() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const memoryDir = path.join(dataDir, 'translation_memory');
  
  log(`\nData directory: ${dataDir}`, 'cyan');
  log(`Translation memory directory: ${memoryDir}`, 'cyan');
  
  try {
    await fs.access(memoryDir);
    log('✓ Translation memory directory exists', 'green');
    
    // List existing memory files
    const files = await fs.readdir(memoryDir);
    if (files.length > 0) {
      log('\nExisting translation memory files:', 'yellow');
      for (const file of files) {
        if (file.endsWith('.json')) {
          const stats = await fs.stat(path.join(memoryDir, file));
          log(`  - ${file} (${stats.size} bytes)`, 'cyan');
        }
      }
    }
  } catch {
    log('ℹ Translation memory directory will be created on first use', 'yellow');
  }
}

async function testBasicTranslation() {
  logSection('Test 1: Basic Translation with Domain');
  
  const result = await translateContent({
    content: "Please enter your credit card number",
    targetLanguage: "zh-TW",
    domain: "finance"
  });
  
  log('\nResult:', 'green');
  console.log(result.content[0].text);
}

async function testContextAwareTranslation() {
  logSection('Test 2: Context-Aware Translation');
  
  // First translation - educational context
  log('\nTranslating "credit" in educational context:', 'yellow');
  const edu = await translateContent({
    content: "credit",
    targetLanguage: "zh-TW",
    context: "University course - students need 30 credits to graduate",
    domain: "education"
  });
  console.log(edu.content[0].text);
  
  // Second translation - financial context
  log('\nTranslating "credit" in financial context:', 'yellow');
  const fin = await translateContent({
    content: "credit",
    targetLanguage: "zh-TW",
    context: "Banking system - checking customer credit score",
    domain: "finance"
  });
  console.log(fin.content[0].text);
}

async function testTranslationMemory() {
  logSection('Test 3: Translation Memory (Persistence)');
  
  // Translate the same content twice to test memory
  log('\nFirst translation of "Submit":', 'yellow');
  const first = await translateContent({
    content: "Submit",
    targetLanguage: "zh-TW",
    domain: "ui",
    context: "Button for form submission"
  });
  console.log(first.content[0].text);
  
  log('\nSecond translation of "Submit" (should reference memory):', 'yellow');
  const second = await translateContent({
    content: "Submit",
    targetLanguage: "zh-TW",
    domain: "ui",
    context: "Another form submission button"
  });
  console.log(second.content[0].text);
}

async function testDialogMode() {
  logSection('Test 4: Agent-to-Agent Dialog');
  
  log('\nInitiating dialog for ambiguous term:', 'yellow');
  const dialog1 = await translateContent({
    content: "The application was rejected",
    targetLanguage: "es",
    requestClarification: true
  });
  
  console.log(dialog1.content[0].text);
  
  // Extract dialog ID from the response
  const dialogIdMatch = dialog1.content[0].text.match(/dialog_[\w]+/);
  if (dialogIdMatch) {
    const dialogId = dialogIdMatch[0];
    log(`\nContinuing dialog with ID: ${dialogId}`, 'cyan');
    
    // Continue the dialog with clarification
    const dialog2 = await translateContent({
      content: "The application was rejected",
      targetLanguage: "es",
      previousDialogId: dialogId,
      context: "This is about a job application that was not accepted"
    });
    
    console.log(dialog2.content[0].text);
  }
}

async function testMultipleDomains() {
  logSection('Test 5: Multiple Domains');
  
  const domains = [
    { content: "Error: Access denied", domain: "error_messages", targetLanguage: "ja" },
    { content: "Terms and conditions", domain: "legal", targetLanguage: "fr" },
    { content: "Blood pressure", domain: "healthcare", targetLanguage: "de" },
    { content: "API endpoint", domain: "technical", targetLanguage: "zh-TW" }
  ];
  
  for (const test of domains) {
    log(`\nTranslating "${test.content}" (${test.domain} domain) to ${test.targetLanguage}:`, 'yellow');
    const result = await translateContent(test);
    console.log(result.content[0].text.split('\n')[2]); // Just show the translation line
  }
}

async function showMemoryStats() {
  logSection('Translation Memory Statistics');
  
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const memoryDir = path.join(dataDir, 'translation_memory');
  
  try {
    const files = await fs.readdir(memoryDir);
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('dialog'));
    
    let totalTranslations = 0;
    let totalUsage = 0;
    
    for (const file of jsonFiles) {
      const data = await fs.readFile(path.join(memoryDir, file), 'utf-8');
      const memory = JSON.parse(data);
      
      totalTranslations += memory.length;
      totalUsage += memory.reduce((sum, entry) => sum + entry.usageCount, 0);
      
      log(`\n${file}:`, 'cyan');
      log(`  - Total entries: ${memory.length}`, 'green');
      log(`  - Most used translations:`, 'yellow');
      
      // Show top 3 most used
      memory
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 3)
        .forEach(entry => {
          log(`    • "${entry.sourceText}" → "${entry.targetText}" (used ${entry.usageCount} times)`, 'reset');
        });
    }
    
    log(`\nOverall Statistics:`, 'bright');
    log(`  - Total unique translations: ${totalTranslations}`, 'green');
    log(`  - Total usage count: ${totalUsage}`, 'green');
    
  } catch (error) {
    log('No translation memory found yet. Run some translations first!', 'yellow');
  }
}

async function runAllTests() {
  log('\n🚀 MCP Translation Tool - Comprehensive Feature Test', 'bright');
  
  // Check environment
  if (!process.env.OPENAI_API_KEY) {
    log('\n❌ ERROR: OPENAI_API_KEY environment variable is not set!', 'red');
    log('Please set it in your .env file or environment', 'red');
    process.exit(1);
  }
  
  await checkDataDir();
  
  try {
    await testBasicTranslation();
    await testContextAwareTranslation();
    await testTranslationMemory();
    await testDialogMode();
    await testMultipleDomains();
    await showMemoryStats();
    
    log('\n✅ All tests completed successfully!', 'green');
    log('\nCheck your DATA_DIR/translation_memory/ folder to see the persisted data.', 'cyan');
    
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run tests
runAllTests(); 