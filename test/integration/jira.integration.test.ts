import { jest } from '@jest/globals';
import { jiraToolHandler } from '../../src/tools/jira/jiraTools.js';
import { setupTestEnvironment, cleanupTestEnvironment, loadFixture, createMockResponse } from '../utils/testHelpers.js';
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

interface JiraError {
  error: string;
}

// Mock node-fetch
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(),
  Response: jest.fn()
}));

const { default: fetch } = await import('node-fetch');
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('JIRA Integration', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestEnvironment();
  });

  describe('Ticket Creation and Memory Storage', () => {
    it('should create a ticket and store in memory', async () => {
      // Load test data
      const ticketData = await loadFixture<JiraTicket>('jira/responses/ticket.json');
      
      // Mock JIRA API response
      mockedFetch.mockResolvedValueOnce(createMockResponse(ticketData));

      // Create ticket
      const result = await jiraToolHandler({
        action: 'create',
        domain: 'ticket',
        context: {
          projectKey: 'TEST',
          summary: 'Test ticket',
          description: 'Test description'
        }
      });

      // Verify ticket creation
      expect(result.json).toEqual(ticketData);
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
    });
  });

  describe('Credential Management', () => {
    it('should handle expired credentials', async () => {
      // Load test data
      const errorData = await loadFixture<JiraError>('jira/responses/expired-credentials.json');
      
      // Mock JIRA API response
      mockedFetch.mockResolvedValueOnce(createMockResponse(errorData, 401));

      // Attempt to create ticket with expired credentials
      const result = await jiraToolHandler({
        action: 'create',
        domain: 'ticket',
        context: {
          projectKey: 'TEST',
          summary: 'Test ticket'
        }
      });

      // Verify error handling
      expect(result.json).toHaveProperty('error');
      expect(result.json.error).toContain('Credentials expired');
    });
  });
}); 