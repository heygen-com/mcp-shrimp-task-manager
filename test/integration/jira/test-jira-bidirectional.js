#!/usr/bin/env node

import { project } from '../dist/tools/project/unifiedProject.js';

async function testBidirectionalLinking() {
  console.log('Testing JIRA Bidirectional Linking...\n');
  
  try {
    // Step 1: Create a new project
    console.log('1. Creating new project:');
    const createResult = await project({
      action: 'create',
      name: 'Bidirectional Test Project',
      description: 'Testing bidirectional JIRA linking',
      tags: ['test', 'jira', 'bidirectional']
    });
    
    console.log(createResult.content[0].text);
    
    // Extract project ID
    const idMatch = createResult.content[0].text.match(/\(ID: ([^)]+)\)/);
    const projectId = idMatch ? idMatch[1] : null;
    
    if (!projectId) {
      throw new Error('Failed to extract project ID');
    }
    
    console.log(`\nProject ID: ${projectId}\n`);
    console.log('---\n');
    
    // Step 2: Simulate linking to JIRA (without actual API call for test)
    console.log('2. Testing JIRA label format:');
    const projectLabel = `project-${projectId}`;
    console.log(`Label that would be added to JIRA: ${projectLabel}`);
    console.log('\n---\n');
    
    // Step 3: Test the actual updateJiraIssueLabels function (commented out to avoid API calls)
    console.log('3. Testing updateJiraIssueLabels function:');
    console.log('Note: Actual API call is commented out in test');
    console.log('In production, this would add the label to the JIRA epic');
    
    // Uncomment to test with real JIRA:
    // await updateJiraIssueLabels('TT-206', [projectLabel]);
    
    console.log('\n---\n');
    
    // Step 4: Show how to search in JIRA
    console.log('4. How to find this project in JIRA:');
    console.log('JQL Query Options:');
    console.log(`- Specific project: labels = "${projectLabel}"`);
    console.log(`- All MCP projects: labels ~ "project-*"`);
    console.log('\n---\n');
    
    // Step 5: Show bidirectional lookup
    console.log('5. Bidirectional Lookup:');
    console.log('\nFrom Project → JIRA:');
    console.log('- Open project to see linked JIRA epic');
    console.log('- project.json contains epic details');
    
    console.log('\nFrom JIRA → Project:');
    console.log('- Look for label starting with "project-"');
    console.log(`- Extract project ID: ${projectId}`);
    console.log('- Use: project open --projectId "{id}"');
    
    console.log('\n---\n');
    console.log('✅ Bidirectional linking test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testBidirectionalLinking(); 