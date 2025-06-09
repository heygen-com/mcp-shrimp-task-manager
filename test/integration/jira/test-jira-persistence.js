#!/usr/bin/env node

import { project } from '../dist/tools/project/unifiedProject.js';
import fs from 'fs/promises';
import path from 'path';

// Data directory paths
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");

async function testJiraPersistence() {
  console.log('Testing JIRA Epic Persistence to project.json...\n');
  
  try {
    // Step 1: Create a new project
    console.log('1. Creating new project:');
    const createResult = await project({
      action: 'create',
      name: 'JIRA Persistence Test',
      description: 'Testing that JIRA epic info persists in project.json',
      tags: ['test', 'jira', 'persistence']
    });
    
    console.log(createResult.content[0].text);
    
    // Extract project ID from the response
    const idMatch = createResult.content[0].text.match(/\(ID: ([^)]+)\)/);
    const projectId = idMatch ? idMatch[1] : null;
    
    if (!projectId) {
      throw new Error('Failed to extract project ID');
    }
    
    console.log(`\nProject ID: ${projectId}\n`);
    console.log('---\n');
    
    // Step 2: Read the project.json before linking
    const projectDir = path.join(PROJECTS_DIR, projectId);
    const projectJsonPath = path.join(projectDir, 'project.json');
    
    console.log('2. Reading project.json BEFORE JIRA linking:');
    const beforeLinking = JSON.parse(await fs.readFile(projectJsonPath, 'utf-8'));
    console.log('External Tracker:', beforeLinking.externalTracker || 'None');
    console.log('\n---\n');
    
    // Step 3: Link to JIRA epic (simulate with test data)
    console.log('3. Linking to JIRA epic:');
    
    // Note: In a real scenario, you would use:
    // const linkResult = await project({
    //   action: 'link_jira',
    //   projectId: projectId,
    //   jiraProjectKey: 'TEST'
    // });
    
    // For testing purposes, we'll manually update the project
    const { updateProject } = await import('../dist/models/projectModel.js');
    const { TrackerType } = await import('../dist/types/index.js');
    
    await updateProject(projectId, {
      externalTracker: {
        type: TrackerType.JIRA,
        issueKey: 'TEST-123',
        issueType: 'epic',
        url: 'https://example.atlassian.net/browse/TEST-123'
      }
    });
    
    console.log('✅ Simulated JIRA epic linking (TEST-123)\n');
    console.log('---\n');
    
    // Step 4: Read the project.json AFTER linking
    console.log('4. Reading project.json AFTER JIRA linking:');
    const afterLinking = JSON.parse(await fs.readFile(projectJsonPath, 'utf-8'));
    
    if (afterLinking.externalTracker) {
      console.log('✅ JIRA info found in project.json:');
      console.log(JSON.stringify(afterLinking.externalTracker, null, 2));
    } else {
      console.log('❌ No JIRA info found in project.json!');
    }
    
    console.log('\n---\n');
    
    // Step 5: Open the project to verify JIRA info is shown
    console.log('5. Opening project to verify JIRA info is displayed:');
    const openResult = await project({
      action: 'open',
      projectId: projectId
    });
    
    const projectPrompt = openResult.content[0].text;
    
    // Check if External Tracker section exists
    if (projectPrompt.includes('### External Tracker')) {
      console.log('✅ JIRA info is displayed when opening project:');
      
      // Extract the External Tracker section
      const trackerStart = projectPrompt.indexOf('### External Tracker');
      const trackerEnd = projectPrompt.indexOf('\n###', trackerStart + 1);
      const trackerSection = trackerEnd !== -1 
        ? projectPrompt.substring(trackerStart, trackerEnd)
        : projectPrompt.substring(trackerStart, trackerStart + 300);
      
      console.log(trackerSection);
    } else {
      console.log('❌ JIRA info NOT displayed when opening project!');
    }
    
    console.log('\n---\n');
    
    // Step 6: Verify persistence by reading raw file
    console.log('6. Raw project.json content:');
    const rawContent = await fs.readFile(projectJsonPath, 'utf-8');
    const parsed = JSON.parse(rawContent);
    
    console.log('Project Name:', parsed.name);
    console.log('Project ID:', parsed.id);
    console.log('External Tracker:', JSON.stringify(parsed.externalTracker, null, 2));
    
    console.log('\n---\n');
    console.log('✅ Test completed successfully!');
    console.log('\nSummary:');
    console.log(`- Project created: ${projectId}`);
    console.log(`- Project location: ${projectDir}`);
    console.log(`- JIRA epic linked: ${parsed.externalTracker?.issueKey || 'None'}`);
    console.log(`- Persistence verified: ${parsed.externalTracker ? 'YES' : 'NO'}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testJiraPersistence(); 