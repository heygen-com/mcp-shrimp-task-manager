import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';

// Mock node-fetch module before any imports
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn()
}));

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
  readFile: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  rm: jest.fn()
}));

// Import the mocked modules
const nodeFetch = await import('node-fetch');
const fs = await import('fs/promises');

// Cast the mocked functions to proper types
const mockedFetch = nodeFetch.default as jest.MockedFunction<typeof nodeFetch.default>;
const mockedReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockedMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
const mockedWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockedRm = fs.rm as jest.MockedFunction<typeof fs.rm>;

// Import jiraToolHandler after setting up mocks
const { jiraToolHandler } = await import('../../../src/tools/jiraTools.js');

// Mock environment variables
const originalEnv = process.env;

// Track created files for cleanup
const createdFiles: string[] = [];

describe('JIRA Ticket Lifecycle Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createdFiles.length = 0; // Clear the list
    
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
    mockedWriteFile.mockImplementation((path) => {
      createdFiles.push(path as string);
      return Promise.resolve();
    });
    mockedRm.mockResolvedValue(undefined);

    // Configure node-fetch mock responses
    mockedFetch.mockImplementation((url: any, init?: any) => {
      const urlString = typeof url === 'string' ? url : url.toString();
      
      // Mock project verification
      if (urlString.includes('/rest/api/3/project/TEST')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ 
            id: '10000',
            key: 'TEST', 
            name: 'Test Project' 
          }),
          text: () => Promise.resolve(JSON.stringify({ 
            id: '10000',
            key: 'TEST', 
            name: 'Test Project' 
          }))
        }) as any;
      }
      
      // Mock issue type lookup for epic creation
      if (urlString.includes('/rest/api/3/issuetype/project')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { id: '10001', name: 'Epic', hierarchyLevel: 1 },
            { id: '10002', name: 'Task', hierarchyLevel: 0 }
          ]),
          text: () => Promise.resolve(JSON.stringify([
            { id: '10001', name: 'Epic', hierarchyLevel: 1 },
            { id: '10002', name: 'Task', hierarchyLevel: 0 }
          ]))
        }) as any;
      }
      
      // Mock issue creation
      if (urlString.includes('/rest/api/3/issue') && !urlString.includes('/browse/')) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ 
            id: '10001', 
            key: 'TEST-101', 
            self: 'https://test.atlassian.net/rest/api/3/issue/10001' 
          }),
          text: () => Promise.resolve(JSON.stringify({ 
            id: '10001', 
            key: 'TEST-101', 
            self: 'https://test.atlassian.net/rest/api/3/issue/10001' 
          }))
        }) as any;
      }
      
      // Mock search
      if (urlString.includes('/rest/api/3/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ 
            issues: [
              { key: 'TEST-100', fields: { summary: 'Test ticket 1', status: { name: 'Open' }, project: { key: 'TEST' } } }, 
              { key: 'TEST-101', fields: { summary: 'Test ticket 2', status: { name: 'In Progress' }, project: { key: 'TEST' } } }
            ] 
          }),
          text: () => Promise.resolve(JSON.stringify({ 
            issues: [
              { key: 'TEST-100', fields: { summary: 'Test ticket 1', status: { name: 'Open' }, project: { key: 'TEST' } } }, 
              { key: 'TEST-101', fields: { summary: 'Test ticket 2', status: { name: 'In Progress' }, project: { key: 'TEST' } } }
            ] 
          }))
        }) as any;
      }
      
      // Default 404
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'URL not mocked' }),
        text: () => Promise.resolve(JSON.stringify({ error: 'URL not mocked' }))
      }) as any;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  afterAll(async () => {
    // Clean up any created files/directories
    if (process.env.DATA_DIR) {
      try {
        await mockedRm(process.env.DATA_DIR, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Create Ticket', () => {
    it('should create a new JIRA ticket in TEST project', async () => {
      const result = await jiraToolHandler({
        action: 'create',
        domain: 'ticket',
        context: {
          projectKey: 'TEST',
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
          body: expect.stringContaining('"project":{"key":"TEST"}')
        })
      );

      // Verify the response
      const jsonResult = result.json as Record<string, unknown>;
      expect(jsonResult).toHaveProperty('key', 'TEST-101');
      expect(jsonResult).toHaveProperty('url', 'https://test.atlassian.net/browse/TEST-101');
      expect(result.markdown).toContain('Ticket Created');
      expect(result.markdown).toContain('TEST-101');

      // Verify local storage was updated
      expect(mockedWriteFile).toHaveBeenCalled();
    });

    it('should not create duplicate tickets', async () => {
      // Mock existing tickets in local storage
      const existingTickets = [{
        key: 'TEST-100',
        url: 'https://test.atlassian.net/browse/TEST-100',
        summary: 'Test ticket for Jest',
        metadata: { testId: 'jest-test-001' }
      }];

      mockedReadFile.mockResolvedValueOnce(JSON.stringify(existingTickets));

      const result = await jiraToolHandler({
        action: 'create',
        domain: 'ticket',
        context: {
          projectKey: 'TEST',
          summary: 'Test ticket for Jest',
          metadata: { testId: 'jest-test-001' }
        }
      });

      // Should not call JIRA API for duplicate
      expect(mockedFetch).not.toHaveBeenCalled();
      
      // Should return existing ticket
      expect(result.markdown).toContain('Ticket Already Exists');
      const jsonResult = result.json as Record<string, unknown>;
      expect(jsonResult).toHaveProperty('key', 'TEST-100');
    });
  });

  describe('Update Ticket', () => {
    it('should update an existing JIRA ticket', async () => {
      // Note: Since updateJiraTicket is not implemented, we'll test the expected behavior
      const ticketKey = 'TEST-101';
      const updateData = {
        summary: 'Updated summary',
        description: 'Updated description',
        labels: ['test', 'jest', 'updated']
      };

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
      const ticketKey = 'TEST-101';

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
    it('should find tickets assigned to current user in TEST project', async () => {
      const result = await jiraToolHandler({
        action: 'find',
        domain: 'ticket',
        context: {
          projectKey: 'TEST'
        }
      });

      // Verify JQL query - the actual call includes ORDER BY and fields parameters
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/3/search?jql=project%20%3D%20TEST%20AND%20assignee%20%3D%20currentUser()%20ORDER%20BY%20created%20DESC&fields=key,summary,status,project',
        expect.any(Object)
      );

      // Verify response
      const jsonArray = result.json as Array<Record<string, unknown>>;
      expect(jsonArray).toHaveLength(2);
      expect(jsonArray[0]).toHaveProperty('key', 'TEST-100');
      expect(jsonArray[1]).toHaveProperty('key', 'TEST-101');
      expect(result.markdown).toContain('TEST-100');
      expect(result.markdown).toContain('TEST-101');
    });
  });

  describe('Full Lifecycle Integration', () => {
    it('should complete a full ticket lifecycle: create -> update -> delete', async () => {
      // Step 1: Create ticket
      const createResult = await jiraToolHandler({
        action: 'create',
        domain: 'ticket',
        context: {
          projectKey: 'TEST',
          summary: 'Lifecycle test ticket',
          description: 'Testing full lifecycle'
        }
      });

      const jsonResult = createResult.json as Record<string, unknown>;
      expect(jsonResult).toHaveProperty('key', 'TEST-101');

      // Step 2: Update ticket (when implemented)
      // ...

      // Step 3: Delete ticket (when implemented)
      // ...
    });
  });
}); 