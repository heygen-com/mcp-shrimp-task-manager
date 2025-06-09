#!/usr/bin/env node

import { project } from '../dist/tools/project/unifiedProject.js';

async function testProjectTrackerIntegration() {
  console.log('Testing project creation with external tracker integration...\n');
  
  try {
    // Test 1: Create project with JIRA integration
    console.log('1. Creating project with JIRA integration:');
    const createResult = await project({
      action: 'create',
      name: 'Payment Gateway Integration',
      description: 'Integrate Stripe payment gateway for subscription management',
      goals: ['Implement payment processing', 'Add subscription management', 'Handle webhooks'],
      tags: ['payment', 'integration', 'backend'],
      trackerType: 'jira',
      trackerIssueKey: 'PAY-456',
      trackerIssueType: 'epic',
      trackerUrl: 'https://company.atlassian.net/browse/PAY-456',
      priority: 'high',
      category: 'feature',
      owner: 'john.doe@company.com',
      team: 'Backend Team',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      repository: 'https://github.com/company/payment-service'
    });
    
    console.log(createResult.content[0].text);
    
    // Extract project ID from the response
    const idMatch = createResult.content[0].text.match(/\(ID: ([^)]+)\)/);
    const projectId = idMatch ? idMatch[1] : null;
    
    console.log('\n---\n');
    
    // Test 2: List projects to see the new format
    console.log('2. Listing all projects:');
    const listResult = await project({
      action: 'list'
    });
    
    console.log(listResult.content[0].text);
    console.log('\n---\n');
    
    // Test 3: Open project using the specific ID
    if (projectId) {
      console.log(`3. Opening the project by ID (${projectId}):`);
      const openResult = await project({
        action: 'open',
        projectId: projectId
      });
      
      // Show the full prompt to see all sections
      const content = openResult.content[0].text;
      console.log('Project sections:');
      console.log('='.repeat(60));
      
      // Extract key sections
      const sections = [
        '## Description',
        '## Goals',
        '## Project Metadata',
        '### External Tracker',
        '### Project Details'
      ];
      
      for (const section of sections) {
        const sectionStart = content.indexOf(section);
        if (sectionStart !== -1) {
          const sectionEnd = content.indexOf('\n##', sectionStart + 1);
          const sectionContent = sectionEnd !== -1 
            ? content.substring(sectionStart, sectionEnd)
            : content.substring(sectionStart, Math.min(sectionStart + 500, content.length));
          console.log(sectionContent.trim());
          console.log('-'.repeat(40));
        }
      }
      
      console.log('='.repeat(60));
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run test
testProjectTrackerIntegration(); 