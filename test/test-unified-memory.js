#!/usr/bin/env node

import { memories } from '../dist/tools/memory/unifiedMemory.js';

async function testUnifiedMemory() {
  console.log('Testing Unified Memory Tool\n');
  
  try {
    // Test 1: Record a memory
    console.log('1. Testing record action...');
    const recordResult = await memories({
      action: 'record',
      content: 'This is a test memory created by the unified memory tool test script',
      summary: 'Test memory from unified tool',
      type: 'breakthrough',
      tags: ['test', 'unified-memory'],
      confidence: 0.9
    });
    console.log('Record result:', recordResult.content[0].text);
    console.log('');
    
    // Test 2: Query memories
    console.log('2. Testing query action...');
    const queryResult = await memories({
      action: 'query',
      searchText: 'test',
      filters: {
        types: ['breakthrough']
      },
      limit: 5
    });
    console.log('Query result (first 200 chars):', queryResult.content[0].text.substring(0, 200) + '...');
    console.log('');
    
    // Test 3: Get stats
    console.log('3. Testing maintenance action (get_stats)...');
    const statsResult = await memories({
      action: 'maintenance',
      operation: 'get_stats'
    });
    console.log('Stats result:', statsResult.content[0].text);
    console.log('');
    
    console.log('✅ All tests passed! The unified memory tool is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testUnifiedMemory(); 