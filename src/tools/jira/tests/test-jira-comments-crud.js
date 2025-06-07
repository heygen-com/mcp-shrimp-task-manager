#!/usr/bin/env node
/**
 * Integration test for JIRA Comment CRUD operations
 * Tests the new TicketComment domain with all four operations: Create, Read, Update, Delete
 */

import { jiraToolHandler } from '../src/tools/jiraTools.js';

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(color + message + colors.reset);
}

async function testJiraCommentCRUD() {
  console.log('\n=== JIRA Comment CRUD Integration Test ===\n');

  const testIssueKey = 'TEST-1'; // Update this to a real TEST project ticket
  let createdCommentId = null;

  try {
    // Test 1: CREATE Comment
    log(colors.blue, '🔵 Test 1: Creating a new comment...');
    const createResult = await jiraToolHandler({
      action: 'create',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey,
        body: 'This is a test comment created by the CRUD test script. Time: ' + new Date().toISOString()
      }
    });

    if (createResult.json && typeof createResult.json === 'object' && 'id' in createResult.json) {
      createdCommentId = createResult.json.id;
      log(colors.green, `✅ CREATE Success: Comment created with ID ${createdCommentId}`);
      console.log('   Markdown output preview:', createResult.markdown.substring(0, 100) + '...');
    } else {
      log(colors.red, '❌ CREATE Failed:');
      console.log(createResult);
      return;
    }

    // Test 2: READ specific comment
    log(colors.blue, '\n🔵 Test 2: Reading the created comment...');
    const readResult = await jiraToolHandler({
      action: 'read',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey,
        commentId: createdCommentId
      }
    });

    if (readResult.json && typeof readResult.json === 'object' && 'id' in readResult.json) {
      log(colors.green, '✅ READ Success: Comment retrieved successfully');
      console.log('   Comment ID:', readResult.json.id);
      console.log('   Author:', readResult.json.author?.displayName || 'Unknown');
    } else {
      log(colors.red, '❌ READ Failed:');
      console.log(readResult);
    }

    // Test 3: READ all comments
    log(colors.blue, '\n🔵 Test 3: Reading all comments from the issue...');
    const readAllResult = await jiraToolHandler({
      action: 'read',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey
      }
    });

    if (readAllResult.json && typeof readAllResult.json === 'object' && 'total' in readAllResult.json) {
      log(colors.green, `✅ READ ALL Success: Found ${readAllResult.json.total} comments total`);
      if (readAllResult.json.comments && Array.isArray(readAllResult.json.comments)) {
        console.log('   Comments found:', readAllResult.json.comments.length);
      }
    } else {
      log(colors.red, '❌ READ ALL Failed:');
      console.log(readAllResult);
    }

    // Test 4: UPDATE comment
    log(colors.blue, '\n🔵 Test 4: Updating the created comment...');
    const updateResult = await jiraToolHandler({
      action: 'update',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey,
        commentId: createdCommentId,
        body: 'This comment has been UPDATED by the CRUD test script. Time: ' + new Date().toISOString()
      }
    });

    if (updateResult.json && typeof updateResult.json === 'object' && 'updated' in updateResult.json) {
      log(colors.green, '✅ UPDATE Success: Comment updated successfully');
      console.log('   Updated time:', updateResult.json.updated);
    } else {
      log(colors.red, '❌ UPDATE Failed:');
      console.log(updateResult);
    }

    // Test 5: DELETE comment
    log(colors.blue, '\n🔵 Test 5: Deleting the created comment...');
    const deleteResult = await jiraToolHandler({
      action: 'delete',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey,
        commentId: createdCommentId
      }
    });

    if (deleteResult.json && typeof deleteResult.json === 'object' && 'message' in deleteResult.json) {
      log(colors.green, '✅ DELETE Success: Comment deleted successfully');
      console.log('   Message:', deleteResult.json.message);
    } else {
      log(colors.red, '❌ DELETE Failed:');
      console.log(deleteResult);
    }

    // Test 6: Verify deletion by trying to read the deleted comment
    log(colors.blue, '\n🔵 Test 6: Verifying comment deletion...');
    const verifyDeleteResult = await jiraToolHandler({
      action: 'read',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey,
        commentId: createdCommentId
      }
    });

    if (verifyDeleteResult.json && typeof verifyDeleteResult.json === 'object' && 'error' in verifyDeleteResult.json) {
      log(colors.green, '✅ VERIFICATION Success: Comment is no longer accessible (as expected)');
    } else {
      log(colors.yellow, '⚠️  VERIFICATION: Comment might still be accessible (check manually)');
      console.log(verifyDeleteResult);
    }

    log(colors.green, '\n🎉 All CRUD operations completed!');

  } catch (error) {
    log(colors.red, '\n❌ Test failed with error:');
    console.error(error);
  }
}

// Error handling tests
async function testErrorCases() {
  console.log('\n=== Error Handling Tests ===\n');

  try {
    // Test missing issueKey
    log(colors.blue, '🔵 Error Test 1: Missing issueKey...');
    const result1 = await jiraToolHandler({
      action: 'create',
      domain: 'TicketComment',
      context: {
        body: 'This should fail'
      }
    });

    if (result1.json && typeof result1.json === 'object' && 'error' in result1.json) {
      log(colors.green, '✅ Error handling works: Missing issueKey detected');
    } else {
      log(colors.red, '❌ Error handling failed: Should have caught missing issueKey');
    }

    // Test missing body
    log(colors.blue, '\n🔵 Error Test 2: Missing body...');
    const result2 = await jiraToolHandler({
      action: 'create',
      domain: 'TicketComment',
      context: {
        issueKey: 'TEST-1'
      }
    });

    if (result2.json && typeof result2.json === 'object' && 'error' in result2.json) {
      log(colors.green, '✅ Error handling works: Missing body detected');
    } else {
      log(colors.red, '❌ Error handling failed: Should have caught missing body');
    }

    // Test unsupported action
    log(colors.blue, '\n🔵 Error Test 3: Unsupported action...');
    const result3 = await jiraToolHandler({
      action: 'list',
      domain: 'TicketComment',
      context: {
        issueKey: 'TEST-1'
      }
    });

    if (result3.json && typeof result3.json === 'object' && 'error' in result3.json) {
      log(colors.green, '✅ Error handling works: Unsupported action detected');
    } else {
      log(colors.red, '❌ Error handling failed: Should have caught unsupported action');
    }

    log(colors.green, '\n✅ Error handling tests completed!');

  } catch (error) {
    log(colors.red, '\n❌ Error handling test failed:');
    console.error(error);
  }
}

// Run the tests
async function runTests() {
  console.log('Starting JIRA Comment CRUD Integration Tests...');
  console.log('Note: Make sure you have valid JIRA credentials in your environment variables:');
  console.log('  - JIRA_BASE_URL');
  console.log('  - JIRA_USER_EMAIL');
  console.log('  - JIRA_API_TOKEN');
  console.log('  - And a valid TEST project with at least one ticket (e.g., TEST-1)');

  if (!process.env.JIRA_BASE_URL || !process.env.JIRA_USER_EMAIL || !process.env.JIRA_API_TOKEN) {
    log(colors.red, '\n❌ Missing JIRA environment variables. Please set up your credentials first.');
    process.exit(1);
  }

  await testJiraCommentCRUD();
  await testErrorCases();
  await testCommentListFeatures();

  log(colors.blue, '\n🏁 All tests completed! Check the results above.');
}

// Comment list and filtering tests
async function testCommentListFeatures() {
  console.log('\n=== Comment List and Filtering Tests ===\n');

  const testIssueKey = 'TEST-1'; // Update this to a real TEST project ticket

  try {
    // Test 1: List all comments
    log(colors.blue, '🔵 List Test 1: Getting all comments...');
    const listAllResult = await jiraToolHandler({
      action: 'list',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey
      }
    });

    if (listAllResult.json && typeof listAllResult.json === 'object' && 'total' in listAllResult.json) {
      log(colors.green, `✅ LIST ALL Success: Found ${listAllResult.json.total} comments total`);
      console.log('   Filtered results:', listAllResult.json.filtered);
      console.log('   Applied filters:', listAllResult.json.filters?.applied?.length || 0);
    } else {
      log(colors.red, '❌ LIST ALL Failed:');
      console.log(listAllResult);
    }

    // Test 2: List comments from last 24 hours
    log(colors.blue, '\n🔵 List Test 2: Getting comments from last 24 hours...');
    const listRecentResult = await jiraToolHandler({
      action: 'list',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey,
        lastHours: 24
      }
    });

    if (listRecentResult.json && typeof listRecentResult.json === 'object' && 'total' in listRecentResult.json) {
      log(colors.green, `✅ TIME FILTER Success: Found ${listRecentResult.json.filtered} comments in last 24 hours`);
      console.log('   Total comments:', listRecentResult.json.total);
      console.log('   Applied filters:', listRecentResult.json.filters?.applied || []);
    } else {
      log(colors.red, '❌ TIME FILTER Failed:');
      console.log(listRecentResult);
    }

    // Test 3: List comments with text search
    log(colors.blue, '\n🔵 List Test 3: Searching comments for "test"...');
    const listSearchResult = await jiraToolHandler({
      action: 'list',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey,
        textSearch: 'test'
      }
    });

    if (listSearchResult.json && typeof listSearchResult.json === 'object' && 'total' in listSearchResult.json) {
      log(colors.green, `✅ TEXT SEARCH Success: Found ${listSearchResult.json.filtered} comments containing "test"`);
      console.log('   Total comments:', listSearchResult.json.total);
      console.log('   Applied filters:', listSearchResult.json.filters?.applied || []);
    } else {
      log(colors.red, '❌ TEXT SEARCH Failed:');
      console.log(listSearchResult);
    }

    // Test 4: List comments with pagination
    log(colors.blue, '\n🔵 List Test 4: Testing pagination (maxResults=2)...');
    const listPaginatedResult = await jiraToolHandler({
      action: 'list',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey,
        maxResults: 2,
        orderBy: '-created' // Newest first
      }
    });

    if (listPaginatedResult.json && typeof listPaginatedResult.json === 'object' && 'comments' in listPaginatedResult.json) {
      log(colors.green, `✅ PAGINATION Success: Returned ${listPaginatedResult.json.comments.length} comments`);
      console.log('   Max results:', listPaginatedResult.json.maxResults);
      console.log('   Start at:', listPaginatedResult.json.startAt);
      console.log('   Total available:', listPaginatedResult.json.total);
    } else {
      log(colors.red, '❌ PAGINATION Failed:');
      console.log(listPaginatedResult);
    }

    // Test 5: List comments with multiple filters
    log(colors.blue, '\n🔵 List Test 5: Combining time filter and text search...');
    const listCombinedResult = await jiraToolHandler({
      action: 'list',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey,
        lastDays: 7,
        textSearch: 'comment',
        maxResults: 10
      }
    });

    if (listCombinedResult.json && typeof listCombinedResult.json === 'object' && 'filtered' in listCombinedResult.json) {
      log(colors.green, `✅ COMBINED FILTERS Success: Found ${listCombinedResult.json.filtered} matching comments`);
      console.log('   Applied filters:', listCombinedResult.json.filters?.applied || []);
    } else {
      log(colors.red, '❌ COMBINED FILTERS Failed:');
      console.log(listCombinedResult);
    }

    // Test 6: Custom date range
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    log(colors.blue, '\n🔵 List Test 6: Custom date range (since 1 hour ago)...');
    const listDateRangeResult = await jiraToolHandler({
      action: 'list',
      domain: 'TicketComment',
      context: {
        issueKey: testIssueKey,
        since: oneHourAgo
      }
    });

    if (listDateRangeResult.json && typeof listDateRangeResult.json === 'object' && 'filtered' in listDateRangeResult.json) {
      log(colors.green, `✅ DATE RANGE Success: Found ${listDateRangeResult.json.filtered} comments since ${new Date(oneHourAgo).toLocaleTimeString()}`);
      console.log('   Applied filters:', listDateRangeResult.json.filters?.applied || []);
    } else {
      log(colors.red, '❌ DATE RANGE Failed:');
      console.log(listDateRangeResult);
    }

    log(colors.green, '\n✅ Comment list and filtering tests completed!');

  } catch (error) {
    log(colors.red, '\n❌ Comment list tests failed:');
    console.error(error);
  }
}

runTests().catch(error => {
  log(colors.red, '\n💥 Test suite failed:');
  console.error(error);
  process.exit(1);
}); 