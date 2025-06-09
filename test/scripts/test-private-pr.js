#!/usr/bin/env node

// Test script for testing github_pr_context with private repositories
import 'dotenv/config';  // Load .env file
import { githubPRContext } from './dist/tools/githubPRContextTool.js';

async function testPrivatePR() {
  // First, ensure GITHUB_TOKEN is set
  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN is not set!');
    console.error('\nTo test with private repositories:');
    console.error('1. Create a GitHub Personal Access Token with "repo" scope');
    console.error('2. Set it: export GITHUB_TOKEN=your_token_here');
    console.error('3. Run this script again');
    process.exit(1);
  }

  console.log('✅ GITHUB_TOKEN is set\n');

  // Replace this with your actual private PR URL
  const privatePRUrl = process.argv[2];
  
  if (!privatePRUrl) {
    console.error('Usage: node test-private-pr.js <PR_URL>');
    console.error('Example: node test-private-pr.js https://github.com/myorg/private-repo/pull/123');
    process.exit(1);
  }

  console.log(`Testing PR: ${privatePRUrl}\n`);

  try {
    const result = await githubPRContext({ prUrl: privatePRUrl });
    
    // Display the markdown output
    console.log('=== MARKDOWN OUTPUT ===\n');
    console.log(result.content[0].text);
    
    // Save JSON to file for inspection
    if (result.ephemeral?.json_data) {
      const fs = await import('fs/promises');
      const filename = `pr-context-${Date.now()}.json`;
      await fs.writeFile(filename, JSON.stringify(result.ephemeral.json_data, null, 2));
      console.log(`\n✅ Full JSON data saved to: ${filename}`);
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    
    if (error.message.includes('authentication')) {
      console.error('\nMake sure your GITHUB_TOKEN has the "repo" scope for private repositories.');
    }
  }
}

testPrivatePR(); 