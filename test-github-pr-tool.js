#!/usr/bin/env node

// Test script for the github_pr_context tool
// This demonstrates how to test the tool with various PR URLs

import 'dotenv/config';  // Load .env file
import { githubPRContext } from './dist/tools/githubPRContextTool.js';

async function runTest(prUrl) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing PR: ${prUrl}`);
  console.log('='.repeat(60));

  try {
    const result = await githubPRContext({ prUrl });
    
    // Display markdown output
    console.log('\n--- MARKDOWN OUTPUT ---');
    console.log(result.content[0].text);
    
    // Display JSON summary
    if (result.ephemeral?.json_data) {
      console.log('\n--- JSON SUMMARY ---');
      const data = result.ephemeral.json_data;
      console.log(`Title: ${data.pr_metadata.title}`);
      console.log(`Author: ${data.pr_metadata.author.username}`);
      console.log(`Status: ${data.pr_metadata.status}`);
      console.log(`Changed Files: ${data.changed_files.length}`);
      console.log(`Unresolved Review Threads: ${data.unresolved_review_threads.length}`);
      console.log(`Required Checks: ${data.required_checks.length}`);
      console.log(`Reviewers: ${data.reviewers_status.length}`);
      
      // Show first few changed files
      if (data.changed_files.length > 0) {
        console.log('\nFirst 5 changed files:');
        data.changed_files.slice(0, 5).forEach(file => {
          console.log(`  - ${file}`);
        });
      }
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }
}

async function main() {
  console.log('GitHub PR Context Tool Test Suite');
  console.log('=================================\n');
  
  // Check if GITHUB_TOKEN is set
  if (process.env.GITHUB_TOKEN) {
    console.log('✅ GITHUB_TOKEN is set - you can access private repos and have higher rate limits');
  } else {
    console.log('⚠️  GITHUB_TOKEN is not set - you may hit rate limits (60 requests/hour)');
    console.log('   Set it with: export GITHUB_TOKEN=your_token');
  }
  
  // Get PR URL from command line argument
  const prUrl = process.argv[2];
  
  if (!prUrl) {
    console.error('\n❌ Error: Please provide a PR URL as an argument');
    console.error('\nUsage:');
    console.error('  node test-github-pr-tool.js <PR_URL>');
    console.error('\nExamples:');
    console.error('  node test-github-pr-tool.js https://github.com/facebook/react/pull/28000');
    console.error('  node test-github-pr-tool.js https://github.com/microsoft/vscode/pull/200000');
    console.error('  node test-github-pr-tool.js https://github.com/heygen-com/pacific/pull/10721');
    process.exit(1);
  }
  
  // Validate URL format
  if (!prUrl.match(/^https:\/\/github\.com\/[\w-]+\/[\w-]+\/pull\/\d+$/)) {
    console.error('\n❌ Error: Invalid PR URL format');
    console.error('Expected format: https://github.com/owner/repo/pull/number');
    process.exit(1);
  }
  
  console.log(`\nTesting PR: ${prUrl}`);
  await runTest(prUrl);
}

main().catch(console.error); 