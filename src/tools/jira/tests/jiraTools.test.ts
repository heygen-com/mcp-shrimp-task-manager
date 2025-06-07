import { jest } from '@jest/globals';
import { jiraToolHandler } from '../jiraTools.js';
import { setupTestEnvironment, cleanupTestEnvironment, loadFixture } from '../../../../test/utils/testHelpers.js';
import type { Response } from 'node-fetch';

// Mock node-fetch
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(),
  Response: jest.fn()
}));

const { default: fetch } = await import('node-fetch');
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('jiraToolHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment variables
    process.env = {
      ...process.env,
      JIRA_BASE_URL: 'https://test-jira.example.com',
      JIRA_USER_EMAIL: 'test@example.com',
      JIRA_API_TOKEN: 'test-token'
    };
  });

  describe('create action', () => {
    it('should create a ticket successfully', async () => {
      const mockResponse = {
        id: '12345',
        key: 'TEST-123',
        fields: {
          summary: 'Test ticket',
          description: 'Test description',
          status: { name: 'To Do' }
        }
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        size: 0,
        buffer: async () => Buffer.from(''),
      } as Response);

      const result = await jiraToolHandler({
        action: 'create',
        domain: 'ticket',
        context: {
          projectKey: 'TEST',
          summary: 'Test ticket',
          description: 'Test description'
        }
      });

      expect(result.json).toEqual(mockResponse);
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

    it('should handle API errors gracefully', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid project key',
        size: 0,
        buffer: async () => Buffer.from(''),
      } as Response);

      const result = await jiraToolHandler({
        action: 'create',
        domain: 'ticket',
        context: {
          projectKey: 'INVALID',
          summary: 'Test ticket'
        }
      });

      expect(result.json).toHaveProperty('error');
      expect(result.json.error).toContain('JIRA API error: 400 Bad Request');
    });
  });

  describe('verify_credentials action', () => {
    it('should verify valid credentials', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accountId: 'test-user' }),
        size: 0,
        buffer: async () => Buffer.from(''),
      } as Response);

      const result = await jiraToolHandler({
        action: 'verify_credentials',
        domain: 'ticket',
        context: {}
      });

      expect(result.json).toHaveProperty('success', true);
    });

    it('should detect expired credentials', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Token expired',
        size: 0,
        buffer: async () => Buffer.from(''),
      } as Response);

      const result = await jiraToolHandler({
        action: 'verify_credentials',
        domain: 'ticket',
        context: {}
      });

      expect(result.json).toHaveProperty('success', false);
      expect(result.json).toHaveProperty('error');
      expect(result.json.error).toContain('Credentials expired');
    });
  });

  describe('read action', () => {
    it('should read ticket details', async () => {
      const mockResponse = {
        id: '12345',
        key: 'TEST-123',
        fields: {
          summary: 'Test ticket',
          description: 'Test description',
          status: { name: 'In Progress' }
        }
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        size: 0,
        buffer: async () => Buffer.from(''),
      } as Response);

      const result = await jiraToolHandler({
        action: 'read',
        domain: 'ticket',
        context: {
          issueKey: 'TEST-123'
        }
      });

      expect(result.json).toEqual(mockResponse);
    });

    it('should handle non-existent ticket', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Issue does not exist',
        size: 0,
        buffer: async () => Buffer.from(''),
      } as Response);

      const result = await jiraToolHandler({
        action: 'read',
        domain: 'ticket',
        context: {
          issueKey: 'NONEXISTENT-123'
        }
      });

      expect(result.json).toHaveProperty('error');
      expect(result.json.error).toContain('Issue does not exist');
    });
  });
}); 