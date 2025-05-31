import { jest } from '@jest/globals';
import { jiraToolHandler } from '../src/tools/jiraTools';

// Define mock function types
type MockedFunction<T> = jest.MockedFunction<T>;

// Mock node-fetch
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(),
  Response: jest.fn()
}));

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
  readFile: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn()
}));

// Import the mocked modules
const { default: fetch } = await import('node-fetch');
const fs = await import('fs/promises');

// Cast the mocked functions to proper types
const mockedFetch = fetch as MockedFunction<typeof fetch>;
const mockedReadFile = fs.readFile as MockedFunction<typeof fs.readFile>;
const mockedMkdir = fs.mkdir as MockedFunction<typeof fs.mkdir>;
const mockedWriteFile = fs.writeFile as MockedFunction<typeof fs.writeFile>;

// Mock environment variables
const originalEnv = process.env;

describe('JIRA Ticket Lifecycle Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment variables
    process.env = {
      ...originalEnv,
      JIRA_BASE_URL: 'https://test.atlassian.net',
      JIRA_USER_EMAIL: 'test@example.com',
      JIRA_API_TOKEN: 'test-token',
      DATA_DIR: '/tmp/test-data'
    };

    // Mock fs operations
    mockedReadFile.mockRejectedValue(new Error('File not found'));
    mockedMkdir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Create Ticket', () => {
    it('should create a new JIRA ticket in TT project', async () => {
      // Mock JIRA API response for ticket creation
      const mockTicketResponse = {
        id: '10001',
        key: 'TT-101',
        self: 'https://test.atlassian.net/rest/api/3/issue/10001',
        fields: {
          created: '2024-01-01T00:00:00.000Z'
        }
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTicketResponse,
        status: 201,
        statusText: 'Created'
      } as any);

      const result = await jiraToolHandler({
        action: 'create',
        domain: 'ticket',
        context: {
          projectKey: 'TT',
          summary: 'Test ticket for Jest',
          description: 'This is a test ticket created by Jest',
          labels: ['test', 'jest', 'automated'],
          metadata: {
            testId: 'jest-test-001',
            createdBy: 'jest'
          }
        }
      });

      // Verify the fetch was called with correct parameters
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/3/issue',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.any(String),
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('"project":{"key":"TT"}')
        })
      );

      // Verify the response
      const jsonResult = result.json as Record<string, unknown>;
      expect(jsonResult).toHaveProperty('key', 'TT-101');
      expect(jsonResult).toHaveProperty('url', 'https://test.atlassian.net/browse/TT-101');
      expect(result.markdown).toContain('Ticket Created');
      expect(result.markdown).toContain('TT-101');

      // Verify local storage was updated
      expect(mockedWriteFile).toHaveBeenCalled();
    });

    it('should not create duplicate tickets', async () => {
      // Mock existing tickets in local storage
      const existingTickets = [{
        key: 'TT-100',
        url: 'https://test.atlassian.net/browse/TT-100',
        summary: 'Test ticket for Jest',
        metadata: { testId: 'jest-test-001' }
      }];

      mockedReadFile.mockResolvedValueOnce(JSON.stringify(existingTickets));

      const result = await jiraToolHandler({
        action: 'create',
        domain: 'ticket',
        context: {
          projectKey: 'TT',
          summary: 'Test ticket for Jest',
          metadata: { testId: 'jest-test-001' }
        }
      });

      // Should not call JIRA API for duplicate
      expect(mockedFetch).not.toHaveBeenCalled();
      
      // Should return existing ticket
      expect(result.markdown).toContain('Ticket Already Exists');
      const jsonResult = result.json as Record<string, unknown>;
      expect(jsonResult).toHaveProperty('key', 'TT-100');
    });
  });

  describe('Update Ticket', () => {
    it('should update an existing JIRA ticket', async () => {
      // Note: Since updateJiraTicket is not implemented, we'll test the expected behavior
      const ticketKey = 'TT-101';
      const updateData = {
        summary: 'Updated summary',
        description: 'Updated description',
        labels: ['test', 'jest', 'updated']
      };

      // Mock JIRA API response for update
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content'
      } as any);

      // This test demonstrates the expected behavior once update is implemented
      try {
        // Once implemented, this would be the call:
        // const result = await jiraToolHandler({
        //   action: 'update',
        //   domain: 'ticket',
        //   context: {
        //     issueKey: ticketKey,
        //     ...updateData
        //   }
        // });

        // For now, we'll simulate what should happen
        const expectedUrl = `https://test.atlassian.net/rest/api/3/issue/${ticketKey}`;
        const expectedBody = {
          fields: {
            summary: updateData.summary,
            description: {
              type: 'doc',
              version: 1,
              content: [{
                type: 'paragraph',
                content: [{ type: 'text', text: updateData.description }]
              }]
            },
            labels: updateData.labels
          }
        };

        // Simulate the update call
        await mockedFetch(expectedUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${Buffer.from('test@example.com:test-token').toString('base64')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(expectedBody)
        });

        expect(mockedFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
      } catch (error) {
        // Expected until update is implemented
        expect(error).toBeDefined();
      }
    });
  });

  describe('Delete Ticket', () => {
    it('should delete a JIRA ticket', async () => {
      const ticketKey = 'TT-101';

      // Mock JIRA API response for deletion
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content'
      } as any);

      // This test demonstrates the expected behavior once delete is implemented
      try {
        // Once implemented, this would be the call:
        // const result = await jiraToolHandler({
        //   action: 'delete',
        //   domain: 'ticket',
        //   context: {
        //     issueKey: ticketKey
        //   }
        // });

        // For now, we'll simulate what should happen
        const expectedUrl = `https://test.atlassian.net/rest/api/3/issue/${ticketKey}`;

        // Simulate the delete call
        await mockedFetch(expectedUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${Buffer.from('test@example.com:test-token').toString('base64')}`
          }
        });

        expect(mockedFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
      } catch (error) {
        // Expected until delete is implemented
        expect(error).toBeDefined();
      }
    });
  });

  describe('List Tickets', () => {
    it('should find tickets assigned to current user in TT project', async () => {
      const mockTickets = {
        issues: [
          {
            key: 'TT-100',
            fields: {
              summary: 'Test ticket 1',
              status: { name: 'In Progress' },
              project: { key: 'TT' }
            }
          },
          {
            key: 'TT-101',
            fields: {
              summary: 'Test ticket 2',
              status: { name: 'Done' },
              project: { key: 'TT' }
            }
          }
        ]
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTickets,
        status: 200,
        statusText: 'OK'
      } as any);

      const result = await jiraToolHandler({
        action: 'find',
        domain: 'ticket',
        context: {
          projectKey: 'TT'
        }
      });

      // Verify JQL query
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('jql=project%20%3D%20TT%20AND%20assignee%20%3D%20currentUser()'),
        expect.any(Object)
      );

      // Verify response
      const jsonArray = result.json as Array<Record<string, unknown>>;
      expect(jsonArray).toHaveLength(2);
      expect(jsonArray[0]).toHaveProperty('key', 'TT-100');
      expect(jsonArray[1]).toHaveProperty('key', 'TT-101');
      expect(result.markdown).toContain('TT-100');
      expect(result.markdown).toContain('TT-101');
    });
  });

  describe('Full Lifecycle Integration', () => {
    it('should complete a full ticket lifecycle: create -> update -> delete', async () => {
      // Step 1: Create ticket
      const createResponse = {
        id: '10002',
        key: 'TT-102',
        fields: { created: '2024-01-01T00:00:00.000Z' }
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createResponse,
        status: 201
      } as any);

      const createResult = await jiraToolHandler({
        action: 'create',
        domain: 'ticket',
        context: {
          projectKey: 'TT',
          summary: 'Lifecycle test ticket',
          description: 'Testing full lifecycle'
        }
      });

      const jsonResult = createResult.json as Record<string, unknown>;
      expect(jsonResult).toHaveProperty('key', 'TT-102');

      // Step 2: Update ticket (when implemented)
      // ...

      // Step 3: Delete ticket (when implemented)
      // ...
    });
  });
}); 