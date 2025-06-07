#!/usr/bin/env node

import { project } from '../dist/tools/project/unifiedProject.js';

async function testMissingProject() {
  console.log('Testing opening a non-existent project...\n');
  
  try {
    // Try to open the localization project that doesn't exist
    const projectId = 'localization_20250531_031122_709';
    
    console.log(`Attempting to open project: ${projectId}`);
    const result = await project({
      action: 'open',
      projectId: projectId
    });
    
    console.log('\nResult:');
    console.log(result.content[0].text);
    
  } catch (error) {
    console.error('Caught error:', error);
  }
  
  console.log('\n---\n');
  
  // Show what projects actually exist
  console.log('Listing all existing projects:');
  const listResult = await project({
    action: 'list'
  });
  
  console.log(listResult.content[0].text);
}

// Run the test
testMissingProject(); 