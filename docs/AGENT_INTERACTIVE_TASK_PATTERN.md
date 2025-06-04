# Agent Guide: Creating Interactive JIRA Task Lists

## 🎯 Overview

This guide teaches agents how to create **interactive task lists** in JIRA comments that become clickable checkboxes, rather than plain text. JIRA uses ADF (Atlassian Document Format) to create rich, interactive content.

## ✅ The Pattern: From Text to Interactive Checkboxes

### ❌ **What NOT to do** (Plain Text - Non-Interactive)
```
Here are the tasks:
- [ ] Fix login bug
- [ ] Update documentation  
- [x] Add unit tests
```

### ✅ **What TO do** (ADF TaskList - Interactive)
The comment service automatically detects task patterns and converts them to interactive ADF format:

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [{"type": "text", "text": "Here are the tasks:"}]
    },
    {
      "type": "taskList",
      "attrs": {"localId": "tasklist-1672531200000"},
      "content": [
        {
          "type": "taskItem",
          "attrs": {
            "localId": "task-1672531200000-0",
            "state": "TODO"
          },
          "content": [{"type": "text", "text": "Fix login bug"}]
        },
        {
          "type": "taskItem", 
          "attrs": {
            "localId": "task-1672531200000-1",
            "state": "TODO"
          },
          "content": [{"type": "text", "text": "Update documentation"}]
        },
        {
          "type": "taskItem",
          "attrs": {
            "localId": "task-1672531200000-2", 
            "state": "DONE"
          },
          "content": [{"type": "text", "text": "Add unit tests"}]
        }
      ]
    }
  ]
}
```

## 🔄 Automatic Conversion

The JIRA Comment Service automatically detects and converts these text patterns to interactive ADF:

### **Supported Text Patterns:**

1. **Checkbox Format:**
   ```
   - [ ] Pending task
   - [x] Completed task
   ```

2. **Numbered Lists:**
   ```
   1. First task
   2. Second task
   3. Third task
   ```

3. **Action-Oriented Tasks:**
   ```
   - implement user authentication
   - add error handling
   - fix memory leak
   - update API documentation
   - create unit tests
   ```

## 🛠️ Agent Implementation Examples

### **Example 1: Simple Task Creation**
```javascript
// Agent creates comment with task list text
const result = await jiraToolHandler({
  action: 'create',
  domain: 'TicketComment',
  context: {
    issueKey: 'PROJ-123',
    body: `Sprint planning tasks:

- [ ] Review requirements document
- [ ] Design API endpoints  
- [ ] Set up development environment
- [x] Create JIRA tickets`
  }
});

// Service automatically converts to interactive ADF taskList
// Result: Interactive checkboxes in JIRA comment
```

### **Example 2: Code Review Checklist**
```javascript
const reviewChecklist = await jiraToolHandler({
  action: 'create',
  domain: 'TicketComment', 
  context: {
    issueKey: 'PROJ-456',
    body: `Code review checklist for PR #123:

**Security:**
- [ ] Check for SQL injection vulnerabilities
- [ ] Validate input sanitization
- [ ] Review authentication logic

**Performance:**
- [ ] Check for memory leaks
- [ ] Validate database query efficiency
- [x] Run performance benchmarks

**Testing:**
- [ ] Unit tests cover new functionality
- [ ] Integration tests pass
- [ ] E2E tests updated`
  }
});
```

### **Example 3: Bug Fix Action Items**
```javascript
const bugFixTasks = await jiraToolHandler({
  action: 'create',
  domain: 'TicketComment',
  context: {
    issueKey: 'BUG-789',
    body: `Investigation findings and next steps:

The login timeout issue is caused by session management. Here's the plan:

1. implement session timeout configuration
2. add proper session cleanup
3. update user notification system  
4. test with different timeout values
5. deploy to staging environment

Expected completion: End of sprint.`
  }
});
```

## 🎨 Advanced Usage: Manual ADF Creation

For complex scenarios, agents can create ADF directly:

```javascript
import { jiraCommentService } from './tools/jira/jiraCommentService.js';

// Create custom task list with specific states
const taskListAdf = jiraCommentService.createTaskListComment([
  { text: "Design database schema", completed: true, id: "task-db-design" },
  { text: "Implement API endpoints", completed: false, id: "task-api-impl" },
  { text: "Write unit tests", completed: false, id: "task-unit-tests" },
  { text: "Deploy to staging", completed: false, id: "task-deploy-staging" }
], 
"Development progress update:", 
"Please update status as you complete each item.");

const result = await jiraToolHandler({
  action: 'create',
  domain: 'TicketComment',
  context: {
    issueKey: 'PROJ-123',
    body: taskListAdf  // Pass ADF object directly
  }
});
```

## 🔧 Best Practices for Agents

### **1. Use Descriptive Task Text**
```javascript
// ✅ Good - Clear and actionable
"- [ ] Add input validation for email field in registration form"

// ❌ Avoid - Too vague  
"- [ ] Fix stuff"
```

### **2. Group Related Tasks**
```javascript
// ✅ Good - Organized with context
const body = `Backend API tasks:

- [ ] implement user authentication endpoint
- [ ] add password reset functionality  
- [ ] create user profile management

Frontend tasks:

- [ ] update login form validation
- [ ] add forgot password link
- [ ] implement profile edit page`;
```

### **3. Include Context and Deadlines**
```javascript
// ✅ Good - Provides context
const body = `Sprint 23 deliverables (Due: Friday):

- [ ] fix critical login bug (URGENT)
- [ ] update user documentation  
- [x] complete security audit review

Please prioritize the login bug - it's blocking QA testing.`;
```

### **4. Update Task Status**
When tasks are completed, agents can update the comment:

```javascript
// Agent detects task completion and updates  
const updatedBody = `Sprint 23 deliverables (Due: Friday):

- [x] fix critical login bug (URGENT) ✅ COMPLETED
- [ ] update user documentation  
- [x] complete security audit review

Great progress! Only documentation remains.`;

await jiraToolHandler({
  action: 'update',
  domain: 'TicketComment',
  context: {
    issueKey: 'PROJ-123',
    commentId: 'comment-456',
    body: updatedBody
  }
});
```

## 🔍 Pattern Recognition Examples

The service recognizes these patterns automatically:

### **Development Tasks:**
```
- implement OAuth integration
- add error logging middleware  
- refactor database queries
- update API documentation
- create integration tests
```

### **Bug Fix Tasks:**
```
1. Reproduce the issue locally
2. Identify root cause
3. Implement fix with tests
4. Verify fix in staging
5. Deploy to production
```

### **Mixed Format:**
```
Investigation complete. Next actions:

- [x] Analyzed server logs
- [x] Identified memory leak in user service
- [ ] fix memory management in UserService.java
- [ ] add monitoring for memory usage
- [ ] update deployment scripts

Timeline: Complete by end of week.
```

## 🎯 Key Benefits

1. **Interactive Experience**: Users can click checkboxes directly in JIRA
2. **Real-time Updates**: Changes are immediately visible to all stakeholders  
3. **Task Tracking**: JIRA can track task completion across comments
4. **Better Organization**: Visual distinction between completed/pending tasks
5. **Agent Friendly**: Simple text input, automatic conversion to rich format

## ⚠️ Important Notes

- **Automatic Detection**: Service automatically converts recognized patterns
- **Preserve IDs**: Task IDs are generated for tracking/updating
- **Mixed Content**: Can combine task lists with regular text
- **State Management**: Use `TODO` and `DONE` states for task items
- **Unique LocalIds**: Each task gets a unique identifier for updates

## 🚀 Testing the Pattern

```javascript
// Test with a simple task list
const testResult = await jiraToolHandler({
  action: 'create', 
  domain: 'TicketComment',
  context: {
    issueKey: 'TEST-123',
    body: `Test comment with tasks:

- [ ] First test task
- [x] Second test task (completed)
- [ ] Third test task`
  }
});

// Verify the result contains interactive checkboxes in JIRA UI
console.log('Comment created:', testResult.url);
```

---

**🎉 Result**: Comments with interactive, clickable task lists that integrate with JIRA's task tracking features! 