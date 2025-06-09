#!/usr/bin/env node

import { jiraToolHandler } from '../dist/tools/jiraTools.js';

async function createTestTicket() {
  console.log('Creating a test ticket in JIRA TEST project...\n');
  
  try {
    const result = await jiraToolHandler({
      action: 'create',
      domain: 'ticket',
      context: {
        projectKey: 'TEST',
        summary: 'Test ticket created by Jest integration test',
        description: 'This is a test ticket created to verify JIRA integration is working correctly.\n\nCreated at: ' + new Date().toISOString(),
        labels: ['test', 'integration-test', 'automated'],
        metadata: {
          testId: 'jest-integration-test-001',
          createdBy: 'mcp-shrimp-task-manager',
          timestamp: Date.now()
        }
      }
    });
    
    console.log('Success! Test ticket created:\n');
    console.log(result.markdown);
    console.log('\n---\n');
    console.log('Ticket Details:', JSON.stringify(result.json, null, 2));
    
  } catch (error) {
    console.error('Failed to create test ticket:', error);
    if (error.message) {
      console.error('Error message:', error.message);
    }
  }
}

// Run the test
createTestTicket(); 