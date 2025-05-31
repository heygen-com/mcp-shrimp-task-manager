#!/usr/bin/env node

// Simple test script to verify memory system functionality

import { createMemory, queryMemories, getMemoryStats } from '../dist/models/memoryModel.js';

async function testMemorySystem() {
  console.log('Testing Memory System...\n');
  
  try {
    // Test 1: Create a memory
    console.log('1. Creating a test memory...');
    const testMemory = await createMemory({
      content: 'Test memory content for verifying the system works',
      summary: 'Test memory',
      type: 'pattern',
      confidence: 0.8,
      tags: ['test', 'verification'],
      entities: ['memory system', 'test'],
      contextSnapshot: {},
      author: 'test-script',
      metadata: {},
      triggerContext: 'Manual test'
    });
    
    console.log('✓ Memory created successfully!');
    console.log(`  ID: ${testMemory.id}`);
    console.log(`  Created: ${testMemory.created.toISOString()}\n`);
    
    // Test 2: Query memories
    console.log('2. Querying memories...');
    const memories = await queryMemories({
      filters: {
        types: ['pattern']
      },
      limit: 5
    });
    
    console.log(`✓ Found ${memories.length} memories\n`);
    
    // Test 3: Get stats
    console.log('3. Getting memory stats...');
    const stats = await getMemoryStats();
    console.log('✓ Stats retrieved successfully!');
    console.log(`  Total memories: ${stats.totalMemories}`);
    console.log(`  Last updated: ${stats.lastUpdated.toISOString()}\n`);
    
    console.log('All tests passed! ✅');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testMemorySystem(); 