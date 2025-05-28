#!/usr/bin/env node

// Comprehensive test scenarios for github_pr_context tool
import 'dotenv/config';  // Load .env file
import { githubPRContext } from './dist/tools/githubPRContextTool.js';

const scenarios = [
  {
    name: "PR with unresolved review comments",
    url: "https://github.com/nodejs/node/pull/51000",
    expected: "Should show unresolved review threads"
  },
  {
    name: "PR with multiple reviewers",
    url: "https://github.com/microsoft/TypeScript/pull/56000", 
    expected: "Should show multiple reviewer statuses"
  },
  {
    name: "Draft PR",
    url: "https://github.com/vercel/next.js/pull/59000",
    expected: "Should show draft status"
  },
  {
    name: "Merged PR",
    url: "https://github.com/facebook/react/pull/27000",
    expected: "Should show merged status"
  },
  {
    name: "PR with failed checks",
    url: "https://github.com/angular/angular/pull/52000",
    expected: "Should show failed required checks"
  }
];

async function testScenario(scenario) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Scenario: ${scenario.name}`);
  console.log(`Expected: ${scenario.expected}`);
  console.log(`URL: ${scenario.url}`);
  console.log('='.repeat(70));

  try {
    const result = await githubPRContext({ prUrl: scenario.url });
    const data = result.ephemeral?.json_data;

    if (data) {
      // Quick validation
      console.log(`\n✅ PR Title: ${data.pr_metadata.title}`);
      console.log(`✅ Status: ${data.pr_metadata.status}`);
      console.log(`✅ Changed Files: ${data.changed_files.length}`);
      console.log(`✅ Unresolved Threads: ${data.unresolved_review_threads.length}`);
      console.log(`✅ Required Checks: ${data.required_checks.length}`);
      console.log(`✅ Reviewers: ${data.reviewers_status.length}`);

      // Show interesting details
      if (data.unresolved_review_threads.length > 0) {
        console.log('\n📝 Found unresolved review comments!');
        console.log(`   First thread has ${data.unresolved_review_threads[0].comments.length} comments`);
      }

      if (data.required_checks.length > 0) {
        console.log('\n🔍 Required checks:');
        data.required_checks.slice(0, 3).forEach(check => {
          const icon = check.status === 'success' ? '✅' : 
                       check.status === 'failure' ? '❌' : '⏳';
          console.log(`   ${icon} ${check.name}: ${check.status}`);
        });
      }

      if (data.reviewers_status.length > 0) {
        console.log('\n👥 Reviewers:');
        data.reviewers_status.forEach(reviewer => {
          console.log(`   - ${reviewer.username}: ${reviewer.status}`);
        });
      }
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('GitHub PR Context - Scenario Tests');
  console.log('==================================\n');

  const token = process.env.GITHUB_TOKEN;
  console.log(token ? '✅ Using GITHUB_TOKEN for authentication' : '⚠️  No GITHUB_TOKEN set');

  // Test one scenario
  console.log('\nTesting first scenario...');
  await testScenario(scenarios[0]);

  console.log('\n\nTo test all scenarios, run:');
  console.log('node test-scenarios.js --all');

  if (process.argv.includes('--all')) {
    console.log('\nRunning all scenarios...');
    for (const scenario of scenarios) {
      await testScenario(scenario);
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

runAllTests().catch(console.error); 