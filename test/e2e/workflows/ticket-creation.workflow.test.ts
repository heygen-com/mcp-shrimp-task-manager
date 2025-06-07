import { jest } from '@jest/globals';
import { jiraToolHandler } from '../../../src/tools/jira/jiraTools.js';
import { setupTestEnvironment, cleanupTestEnvironment, loadFixture, createMockResponse } from '../../utils/testHelpers.js';
import type { Response } from 'node-fetch';

interface JiraTicket {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string;
    status: {
      name: string;
    };
  };
}

interface JiraComment {
  id: string;
  body: string;
  author: {
    accountId: string;
    emailAddress: string;
    displayName: string;
  };
  created: string;
  updated: string;
}

// Mock node-fetch
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(),
  Response: jest.fn()
}));

const { default: fetch } = await import('node-fetch');
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('Ticket Creation Workflow', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestEnvironment();
  });

  it('should complete full ticket creation workflow', async () => {
    // Load test data
    const ticketData = await loadFixture<JiraTicket>('jira/responses/ticket.json');
    const commentData = await loadFixture<JiraComment>('jira/responses/comment.json');
    
    // Mock JIRA API responses
    mockedFetch
      .mockResolvedValueOnce(createMockResponse(ticketData))
      .mockResolvedValueOnce(createMockResponse(commentData));

    // Step 1: Create ticket
    const createResult = await jiraToolHandler({
      action: 'create',
      domain: 'ticket',
      context: {
        projectKey: 'TEST',
        summary: 'Test ticket',
        description: 'Test description'
      }
    });

    // Verify ticket creation
    expect(createResult.json).toEqual(ticketData);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/rest/api/3/issue'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Basic'),
          'Content-Type': 'application/json'
        })
      })
    );

    // Step 2: Add comment to ticket
    const commentResult = await jiraToolHandler({
      action: 'create',
      domain: 'ticket',
      context: {
        issueKey: ticketData.key,
        body: 'Test comment'
      }
    });

    // Verify comment creation
    expect(commentResult.json).toEqual(commentData);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/rest/api/3/issue/${ticketData.key}/comment`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Basic'),
          'Content-Type': 'application/json'
        })
      })
    );

    // Step 3: Read ticket details
    const readResult = await jiraToolHandler({
      action: 'read',
      domain: 'ticket',
      context: {
        issueKey: ticketData.key
      }
    });

    // Verify ticket details
    expect(readResult.json).toEqual(ticketData);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/rest/api/3/issue/${ticketData.key}`),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Basic')
        })
      })
    );
  });
}); 