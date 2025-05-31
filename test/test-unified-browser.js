#!/usr/bin/env node

import { browser } from '../dist/tools/browser/unifiedBrowser.js';

async function testUnifiedBrowser() {
  console.log('Testing Unified Browser Tool\n');
  
  try {
    // Test 1: List tabs
    console.log('1. Testing list_tabs action...');
    const listResult = await browser({
      action: 'list_tabs'
    });
    console.log('List tabs result (first 300 chars):', listResult.content[0].text.substring(0, 300) + '...');
    console.log('');
    
    // Test 2: Check logs (without specifying tab)
    console.log('2. Testing check_logs action (auto-select most recent tab)...');
    const logsResult = await browser({
      action: 'check_logs'
    });
    console.log('Check logs result (first 300 chars):', logsResult.content[0].text.substring(0, 300) + '...');
    console.log('');
    
    console.log('✅ All tests completed! (Note: Results depend on whether MCP DevTools Bridge server is running)');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testUnifiedBrowser(); 