import { jest } from '@jest/globals';

// Define mock function types
type MockedFunction<T> = jest.MockedFunction<T>;

// Mock node-fetch
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(),
  Response: jest.fn()
}));

// Import the mocked modules
const { default: fetch } = await import('node-fetch');

// Cast the mocked function to proper type
const mockedFetch = fetch as MockedFunction<typeof fetch>;

// Import the modules to test
const { JiraCommentService } = await import('../src/tools/jira/jiraCommentService.js');
const { jiraToolHandler } = await import('../src/tools/jiraTools.js');

// Mock environment variables for testing
const originalEnv = process.env;

describe('JiraCommentService', () => {
  let commentService: JiraCommentService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment variables
    process.env = {
      ...originalEnv,
      JIRA_BASE_URL: 'https://test-jira.example.com',
      JIRA_USER_EMAIL: 'test@example.com',
      JIRA_API_TOKEN: 'test-token'
    };
    
    commentService = new JiraCommentService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createComment', () => {
    it('should create a comment with plain text', async () => {
      const mockResponse = {
        id: 'comment-123',
        author: {
          accountId: 'user-456',
          displayName: 'Test User'
        },
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'This is a test comment' }
              ]
            }
          ]
        },
        created: '2023-12-01T10:00:00.000Z'
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await commentService.createComment('TEST-123', {
        body: 'This is a test comment'
      });

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('comment-123');
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://test-jira.example.com/rest/api/3/issue/TEST-123/comment',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic'),
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should create a comment with ADF body', async () => {
      const adfBody = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'This is an ADF comment' }
            ]
          }
        ]
      };

      const mockResponse = {
        id: 'comment-124',
        author: {
          accountId: 'user-456',
          displayName: 'Test User'
        },
        body: adfBody,
        created: '2023-12-01T10:00:00.000Z'
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await commentService.createComment('TEST-123', {
        body: adfBody
      });

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('comment-124');
    });

    it('should create a comment with visibility restrictions', async () => {
      const mockResponse = {
        id: 'comment-125',
        author: {
          accountId: 'user-456',
          displayName: 'Test User'
        },
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'This is a restricted comment' }
              ]
            }
          ]
        },
        created: '2023-12-01T10:00:00.000Z',
        visibility: {
          type: 'group',
          value: 'developers'
        }
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await commentService.createComment('TEST-123', {
        body: 'This is a restricted comment',
        visibility: {
          type: 'group',
          value: 'developers'
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.visibility).toEqual({
        type: 'group',
        value: 'developers'
      });
    });

    it('should handle API errors', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid issue key'
      } as any);

      const result = await commentService.createComment('INVALID-123', {
        body: 'This will fail'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('JIRA API error: 400 Bad Request');
    });
  });

  describe('readComments', () => {
    it('should read all comments from an issue', async () => {
      const mockResponse = {
        comments: [
          {
            id: 'comment-1',
            author: { 
              accountId: 'user-1',
              displayName: 'User 1' 
            },
            body: 'First comment',
            created: '2023-12-01T10:00:00.000Z'
          },
          {
            id: 'comment-2',
            author: { 
              accountId: 'user-2',
              displayName: 'User 2' 
            },
            body: 'Second comment',
            created: '2023-12-01T11:00:00.000Z'
          }
        ],
        maxResults: 50,
        total: 2,
        startAt: 0
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await commentService.readComments('TEST-123');

      expect(result.success).toBe(true);
      if ('data' in result && result.data && 'comments' in result.data) {
        expect(result.data.comments).toHaveLength(2);
        expect(result.data.total).toBe(2);
      }
    });

    it('should read a specific comment', async () => {
      const mockResponse = {
        id: 'comment-123',
        author: { 
          accountId: 'user-456',
          displayName: 'Test User' 
        },
        body: 'Specific comment',
        created: '2023-12-01T10:00:00.000Z'
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await commentService.readComments('TEST-123', 'comment-123');

      expect(result.success).toBe(true);
      if ('data' in result && result.data && !('comments' in result.data)) {
        expect(result.data.id).toBe('comment-123');
      }
    });
  });

  describe('updateComment', () => {
    it('should update a comment successfully', async () => {
      const mockResponse = {
        id: 'comment-123',
        author: { 
          accountId: 'user-456',
          displayName: 'Test User' 
        },
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Updated comment text' }
              ]
            }
          ]
        },
        created: '2023-12-01T10:00:00.000Z',
        updated: '2023-12-01T12:00:00.000Z'
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await commentService.updateComment('TEST-123', 'comment-123', {
        body: 'Updated comment text'
      });

      expect(result.success).toBe(true);
      expect(result.data?.updated).toBe('2023-12-01T12:00:00.000Z');
    });
  });

  describe('deleteComment', () => {
    it('should delete a comment successfully', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      } as any);

      const result = await commentService.deleteComment('TEST-123', 'comment-123');

      expect(result.success).toBe(true);
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://test-jira.example.com/rest/api/3/issue/TEST-123/comment/comment-123',
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });

  describe('formatCommentForDisplay', () => {
    it('should format a comment for markdown display', () => {
      const comment = {
        id: 'comment-123',
        author: { 
          accountId: 'user-456',
          displayName: 'Test User' 
        },
        body: 'This is a test comment',
        created: '2023-12-01T10:00:00.000Z'
      };

      const markdown = commentService.formatCommentForDisplay(comment);

      expect(markdown).toContain('## Comment comment-123');
      expect(markdown).toContain('**Author:** Test User');
      expect(markdown).toContain('This is a test comment');
    });
  });

  describe('getCommentUrl', () => {
    it('should generate correct comment URL', () => {
      const url = commentService.getCommentUrl('TEST-123', 'comment-456');
      expect(url).toBe('https://test-jira.example.com/browse/TEST-123?focusedCommentId=comment-456');
    });
  });

  describe('listComments', () => {
    const mockCommentsResponse = {
      comments: [
        {
          id: 'comment-1',
          author: { 
            accountId: 'user-1',
            displayName: 'User One',
            emailAddress: 'user1@example.com'
          },
          body: 'First comment about testing',
          created: '2023-12-01T10:00:00.000Z'
        },
        {
          id: 'comment-2',
          author: { 
            accountId: 'user-2',
            displayName: 'User Two',
            emailAddress: 'user2@example.com'
          },
          body: 'Second comment about bugs',
          created: '2023-12-01T11:00:00.000Z'
        },
        {
          id: 'comment-3',
          author: { 
            accountId: 'user-1',
            displayName: 'User One',
            emailAddress: 'user1@example.com'
          },
          body: 'Third comment about features',
          created: '2023-12-01T12:00:00.000Z',
          updated: '2023-12-01T13:00:00.000Z'
        }
      ],
      maxResults: 50,
      total: 3,
      startAt: 0
    };

    it('should list all comments without filters', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentsResponse,
      } as any);

      const result = await commentService.listComments('TEST-123');

      expect(result.success).toBe(true);
      expect(result.data?.comments).toHaveLength(3);
      expect(result.data?.total).toBe(3);
      expect(result.data?.filtered).toBe(3);
      expect(result.data?.filters.applied).toHaveLength(0);
    });

    it('should filter comments by author account ID', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentsResponse,
      } as any);

      const result = await commentService.listComments('TEST-123', {
        authorAccountId: 'user-1'
      });

      expect(result.success).toBe(true);
      expect(result.data?.filtered).toBe(2); // User-1 has 2 comments
      expect(result.data?.total).toBe(3); // Total still 3
      expect(result.data?.filters.applied).toContain('Author ID: user-1');
    });

    it('should filter comments by author display name', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentsResponse,
      } as any);

      const result = await commentService.listComments('TEST-123', {
        authorDisplayName: 'User Two'
      });

      expect(result.success).toBe(true);
      expect(result.data?.filtered).toBe(1); // Only User Two
      expect(result.data?.filters.applied).toContain('Author: User Two');
    });

    it('should filter comments by text search', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentsResponse,
      } as any);

      const result = await commentService.listComments('TEST-123', {
        textSearch: 'testing'
      });

      expect(result.success).toBe(true);
      expect(result.data?.filtered).toBe(1); // Only the comment containing "testing"
      expect(result.data?.filters.applied).toContain('Text search: "testing"');
    });

    it('should filter comments by time range (lastHours)', async () => {
      // Mock current time to be 2023-12-01T14:00:00.000Z
      const mockNow = new Date('2023-12-01T14:00:00.000Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentsResponse,
      } as any);

      const result = await commentService.listComments('TEST-123', {
        lastHours: 2 // Should get comments from last 2 hours (after 12:00)
      });

      expect(result.success).toBe(true);
      expect(result.data?.filtered).toBe(1); // Only comment-3 (created at 12:00)
      expect(result.data?.filters.applied).toContain('Last 2 hours');

      jest.restoreAllMocks();
    });

    it('should filter comments by custom date range', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentsResponse,
      } as any);

      const result = await commentService.listComments('TEST-123', {
        since: '2023-12-01T10:30:00.000Z',
        until: '2023-12-01T11:30:00.000Z'
      });

      expect(result.success).toBe(true);
      expect(result.data?.filtered).toBe(1); // Only comment-2 (created at 11:00)
      expect(result.data?.filters.applied).toContain('Since 12/1/2023');
      expect(result.data?.filters.applied).toContain('Until 12/1/2023');
    });

    it('should handle pagination parameters', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...mockCommentsResponse,
          startAt: 10,
          maxResults: 20
        }),
      } as any);

      const result = await commentService.listComments('TEST-123', {
        startAt: 10,
        maxResults: 20,
        orderBy: '-created'
      });

      expect(result.success).toBe(true);
      expect(result.data?.startAt).toBe(10);
      expect(result.data?.maxResults).toBe(20);
      
      // Check that the API was called with correct parameters
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('startAt=10'),
        expect.any(Object)
      );
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('maxResults=20'),
        expect.any(Object)
      );
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('orderBy=-created'),
        expect.any(Object)
      );
    });

    it('should combine multiple filters', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentsResponse,
      } as any);

      const result = await commentService.listComments('TEST-123', {
        authorAccountId: 'user-1',
        textSearch: 'comment'
      });

      expect(result.success).toBe(true);
      expect(result.data?.filtered).toBe(2); // User-1 comments that contain "comment"
      expect(result.data?.filters.applied).toContain('Author ID: user-1');
      expect(result.data?.filters.applied).toContain('Text search: "comment"');
    });

    it('should handle API errors', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Issue not found'
      } as any);

      const result = await commentService.listComments('INVALID-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('JIRA API error: 404 Not Found');
    });
  });

  describe('formatCommentListForDisplay', () => {
    it('should format comment list for markdown display', () => {
      const mockListData = {
        comments: [
          {
            id: 'comment-1',
            author: { 
              accountId: 'user-1',
              displayName: 'Test User'
            },
            body: 'This is a test comment',
            created: '2023-12-01T10:00:00.000Z'
          }
        ],
        total: 5,
        filtered: 1,
        startAt: 0,
        maxResults: 50,
        filters: {
          applied: ['Author: Test User'],
          author: 'Test User'
        }
      };

      const markdown = commentService.formatCommentListForDisplay(mockListData, 'TEST-123');

      expect(markdown).toContain('# Comment List for TEST-123');
      expect(markdown).toContain('**Total comments in issue:** 5');
      expect(markdown).toContain('**After filtering:** 1');
      expect(markdown).toContain('**Applied Filters:**');
      expect(markdown).toContain('- Author: Test User');
      expect(markdown).toContain('## Comments');
      expect(markdown).toContain('### 1. Comment comment-1');
      expect(markdown).toContain('**Author:** Test User');
    });

    it('should handle empty results', () => {
      const mockListData = {
        comments: [],
        total: 0,
        filtered: 0,
        startAt: 0,
        maxResults: 50,
        filters: {
          applied: [],
        }
      };

      const markdown = commentService.formatCommentListForDisplay(mockListData, 'TEST-123');

      expect(markdown).toContain('*No comments match the specified criteria.*');
    });
  });
});

describe('jiraToolHandler - TicketComment Domain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment variables
    process.env = {
      ...originalEnv,
      JIRA_BASE_URL: 'https://test-jira.example.com',
      JIRA_USER_EMAIL: 'test@example.com',
      JIRA_API_TOKEN: 'test-token'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('TicketComment CREATE', () => {
    it('should create a comment via tool handler', async () => {
      const mockResponse = {
        id: 'comment-789',
        author: { 
          accountId: 'user-789',
          displayName: 'Tool User' 
        },
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Tool created comment' }
              ]
            }
          ]
        },
        created: '2023-12-01T15:00:00.000Z'
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const input = {
        action: 'create' as const,
        domain: 'TicketComment' as const,
        context: {
          issueKey: 'TEST-123',
          body: 'Tool created comment'
        }
      };

      const result = await jiraToolHandler(input);

      expect(result.markdown).toContain('✅ Comment Created Successfully');
      expect(result.json).toHaveProperty('id', 'comment-789');
      expect(result.url).toBe('https://test-jira.example.com/browse/TEST-123?focusedCommentId=comment-789');
    });

    it('should return error when issueKey is missing', async () => {
      const input = {
        action: 'create' as const,
        domain: 'TicketComment' as const,
        context: {
          body: 'Comment without issue key'
        }
      };

      const result = await jiraToolHandler(input);

      expect(result.markdown).toContain('❌ Error: issueKey is required');
      expect(result.json).toHaveProperty('error', 'issueKey is required');
    });

    it('should return error when body is missing', async () => {
      const input = {
        action: 'create' as const,
        domain: 'TicketComment' as const,
        context: {
          issueKey: 'TEST-123'
        }
      };

      const result = await jiraToolHandler(input);

      expect(result.markdown).toContain('❌ Error: body is required');
      expect(result.json).toHaveProperty('error', 'body is required');
    });
  });

  describe('TicketComment READ', () => {
    it('should read all comments via tool handler', async () => {
      const mockResponse = {
        comments: [
          {
            id: 'comment-1',
            author: { 
              accountId: 'user-1',
              displayName: 'User 1' 
            },
            body: 'First comment',
            created: '2023-12-01T10:00:00.000Z'
          }
        ],
        maxResults: 50,
        total: 1,
        startAt: 0
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const input = {
        action: 'read' as const,
        domain: 'TicketComment' as const,
        context: {
          issueKey: 'TEST-123'
        }
      };

      const result = await jiraToolHandler(input);

      expect(result.markdown).toContain('# Comments from TEST-123');
      expect(result.markdown).toContain('**Total:** 1 comments');
      expect(result.json).toHaveProperty('total', 1);
    });

    it('should read a specific comment via tool handler', async () => {
      const mockResponse = {
        id: 'comment-456',
        author: { 
          accountId: 'user-456',
          displayName: 'Specific User' 
        },
        body: 'Specific comment content',
        created: '2023-12-01T10:00:00.000Z'
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const input = {
        action: 'read' as const,
        domain: 'TicketComment' as const,
        context: {
          issueKey: 'TEST-123',
          commentId: 'comment-456'
        }
      };

      const result = await jiraToolHandler(input);

      expect(result.markdown).toContain('# Comment from TEST-123');
      expect(result.markdown).toContain('## Comment comment-456');
      expect(result.json).toHaveProperty('id', 'comment-456');
    });
  });

  describe('TicketComment UPDATE', () => {
    it('should update a comment via tool handler', async () => {
      const mockResponse = {
        id: 'comment-456',
        author: { 
          accountId: 'user-456',
          displayName: 'Test User' 
        },
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Updated via tool' }
              ]
            }
          ]
        },
        created: '2023-12-01T10:00:00.000Z',
        updated: '2023-12-01T16:00:00.000Z'
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const input = {
        action: 'update' as const,
        domain: 'TicketComment' as const,
        context: {
          issueKey: 'TEST-123',
          commentId: 'comment-456',
          body: 'Updated via tool'
        }
      };

      const result = await jiraToolHandler(input);

      expect(result.markdown).toContain('✅ Comment Updated Successfully');
      expect(result.json).toHaveProperty('id', 'comment-456');
      expect(result.json).toHaveProperty('updated', '2023-12-01T16:00:00.000Z');
    });

    it('should return error when commentId is missing for update', async () => {
      const input = {
        action: 'update' as const,
        domain: 'TicketComment' as const,
        context: {
          issueKey: 'TEST-123',
          body: 'Updated content'
        }
      };

      const result = await jiraToolHandler(input);

      expect(result.markdown).toContain('❌ Error: commentId is required');
    });
  });

  describe('TicketComment DELETE', () => {
    it('should delete a comment via tool handler', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      } as any);

      const input = {
        action: 'delete' as const,
        domain: 'TicketComment' as const,
        context: {
          issueKey: 'TEST-123',
          commentId: 'comment-456'
        }
      };

      const result = await jiraToolHandler(input);

      expect(result.markdown).toContain('✅ Comment Deleted Successfully');
      expect(result.json).toHaveProperty('message', 'Comment deleted successfully');
      expect(result.json).toHaveProperty('commentId', 'comment-456');
    });

    it('should return error when commentId is missing for delete', async () => {
      const input = {
        action: 'delete' as const,
        domain: 'TicketComment' as const,
        context: {
          issueKey: 'TEST-123'
        }
      };

      const result = await jiraToolHandler(input);

      expect(result.markdown).toContain('❌ Error: commentId is required');
    });
  });

  describe('Unsupported actions', () => {
    it('should return error for unsupported action', async () => {
      const input = {
        action: 'list' as const,
        domain: 'TicketComment' as const,
        context: {
          issueKey: 'TEST-123'
        }
      };

      const result = await jiraToolHandler(input);

      expect(result.markdown).toContain('❌ Error: Action \'list\' is not supported for TicketComment domain');
      expect(result.json).toHaveProperty('error', 'Unsupported action for TicketComment domain');
    });
  });
}); 