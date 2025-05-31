# Memory System Testing Guide

## Testing Memory Triggers

The memory system can be tested both automatically (through task completion) and manually. Here are concrete examples:

## Manual Testing Examples

### 1. Testing Breakthrough Memory
```javascript
// Simulate a breakthrough discovery
record_memory({
  content: "Finally solved the infinite loop bug! The issue was in the WebSocket reconnection logic - it wasn't clearing the previous timeout, causing multiple reconnection attempts. Fixed by storing the timeout ID and clearing it before each new attempt.",
  summary: "Fixed WebSocket infinite reconnection bug",
  type: "breakthrough",
  tags: ["websocket", "bug-fix", "networking"],
  confidence: 0.9,
  projectId: "chat-app"
})
```

### 2. Testing Decision Memory
```javascript
// Record an architectural decision
record_memory({
  content: "After benchmarking, decided to use PostgreSQL instead of MongoDB for our user data. The relational model fits better with our user-post-comment structure, and we need ACID compliance for financial transactions.",
  summary: "Chose PostgreSQL over MongoDB for main database",
  type: "decision",
  tags: ["database", "architecture", "postgresql"],
  confidence: 0.85,
  projectId: "social-platform"
})
```

### 3. Testing Error Recovery
```javascript
// Document how you solved an error
record_memory({
  content: "Resolved 'Module not found' error in production build. The issue was that TypeScript paths were not being resolved by webpack. Solution: Added tsconfig-paths-webpack-plugin to webpack config.",
  summary: "Fixed TypeScript path resolution in webpack",
  type: "error_recovery",
  tags: ["webpack", "typescript", "build-error"],
  confidence: 0.9,
  projectId: "frontend-app"
})
```

### 4. Testing Pattern Recognition
```javascript
// Identify a recurring pattern
record_memory({
  content: "This is the third time we've had issues with date timezone handling. Pattern: Always store dates in UTC in database, convert to user's timezone only in the UI layer. Never trust client-provided timezones without validation.",
  summary: "Timezone handling pattern identified",
  type: "pattern",
  tags: ["datetime", "timezone", "best-practice"],
  confidence: 0.8,
  projectId: "global-app"
})
```

### 5. Testing User Preference
```javascript
// Note a user preference
record_memory({
  content: "User prefers using early returns instead of nested if statements. They want guard clauses at the beginning of functions to handle edge cases, making the main logic cleaner.",
  summary: "Coding style: early returns over nested conditionals",
  type: "user_preference",
  tags: ["code-style", "clean-code"],
  confidence: 0.95
})
```

## Automatic Trigger Testing

### Through Task Completion

1. **Create a task that will trigger a memory**:
```javascript
split_tasks({
  updateMode: "append",
  tasks: [{
    name: "Debug authentication issue",
    description: "Users report being logged out randomly. Investigate and fix the session handling bug.",
    implementationGuide: "Check session expiry, token refresh logic, and cookie settings"
  }]
})
```

2. **Complete the task with trigger keywords**:
```javascript
complete_task({
  taskId: "task-uuid-here",
  summary: "Finally figured out the issue - session cookies were being set without the 'secure' flag in production, causing them to be dropped on HTTPS. Fixed by updating cookie configuration."
})
```

This will automatically trigger a "breakthrough" memory because of keywords like "finally figured out" and "fixed".

## Testing Memory Chains

1. **Create related memories**:
```javascript
// First memory
const mem1 = record_memory({
  content: "Started implementing real-time chat feature using Socket.io",
  type: "decision",
  tags: ["chat", "realtime", "socketio"]
})

// Related memory
record_memory({
  content: "Encountered scaling issues with Socket.io - need to implement Redis adapter for multiple server instances",
  type: "pattern",
  tags: ["chat", "scaling", "socketio", "redis"],
  relatedMemories: [mem1.id]
})
```

2. **Test chain retrieval**:
```javascript
get_memory_chain({
  memoryId: "first-memory-id",
  depth: 2,
  includeContent: true
})
```

## Testing Memory Decay and Maintenance

1. **Create old memories** (for testing, you'd need to manually update dates):
```javascript
// This would need to be done at the database level for testing
// Create memories with old timestamps to test archival
```

2. **Run maintenance**:
```javascript
// Test archival of old memories
memory_maintenance({
  operation: "archive_old",
  daysOld: 30
})

// Test relevance decay
memory_maintenance({
  operation: "decay_scores"
})

// Check statistics
memory_maintenance({
  operation: "get_stats"
})
```

## Testing Query and Filters

### Complex Query Example
```javascript
query_memory({
  filters: {
    projectId: "chat-app",
    types: ["breakthrough", "error_recovery"],
    tags: ["websocket"],
    minRelevance: 0.5,
    dateRange: {
      start: "2024-01-01",
      end: "2024-12-31"
    }
  },
  searchText: "connection",
  limit: 10,
  sortBy: "relevance"
})
```

## Testing Duplicate Detection

```javascript
// First memory
record_memory({
  content: "Fixed the login bug by adding proper validation",
  summary: "Login validation fix",
  type: "breakthrough",
  tags: ["auth", "validation"]
})

// Try to create duplicate within 5 minutes
record_memory({
  content: "Fixed the login bug by adding proper validation",
  summary: "Login validation fix", 
  type: "breakthrough",
  tags: ["auth", "validation"]
})
// This should be rejected as a duplicate
```

## Integration Testing

### 1. Project + Memory Integration
```javascript
// Create project
project({
  action: "create",
  name: "E-commerce Platform",
  description: "Building a scalable e-commerce solution"
})

// Record project-specific memories
record_memory({
  content: "Decided to use Stripe for payment processing due to excellent API and webhook support",
  type: "decision",
  projectId: "project-id-here",
  tags: ["payments", "stripe", "architecture"]
})

// Open project - memories should appear
project({
  action: "open",
  projectId: "project-id-here"
})
```

### 2. Memory Analytics Testing
```javascript
// Generate analytics after creating various memories
memory_analytics({
  timeRange: "month",
  groupBy: "type",
  projectId: "optional-project-id"
})
```

## Testing the Web Interface

1. **Start the server with GUI enabled**:
```bash
ENABLE_GUI=true node dist/index.js
```

2. **Access Memory Explorer**:
   - Navigate to `http://localhost:PORT/memory-explorer.html`
   - Test filtering by type, project, relevance
   - Test search functionality
   - Test export features

## Common Test Scenarios

### Scenario 1: Debug Session
1. Start working on a bug
2. Try multiple approaches (record attempts)
3. Find solution (triggers breakthrough)
4. Document the pattern for future

### Scenario 2: Architecture Planning
1. Research options (record findings)
2. Make decision (record with reasoning)
3. Implement and find issues (record patterns)
4. Adjust approach (link to original decision)

### Scenario 3: Learning User Preferences
1. User gives feedback on code style
2. User explains their workflow
3. User shares project conventions
4. System learns and remembers preferences

## Validation Checklist

- [ ] Memories are created with proper types
- [ ] Duplicate detection works within time window
- [ ] Tags and entities are extracted correctly
- [ ] Memory chains are properly linked
- [ ] Relevance scores decay over time
- [ ] Archives work for old memories
- [ ] Search and filters return correct results
- [ ] Project integration loads relevant memories
- [ ] Export/import maintains data integrity
- [ ] Web interface displays memories correctly

## Tips for Effective Testing

1. **Use realistic content**: Don't just test with "test memory 1" - use actual code scenarios
2. **Test edge cases**: Very long content, special characters, multiple languages
3. **Test the full lifecycle**: Create → Access → Update → Decay → Archive
4. **Verify integrations**: Ensure memories enhance the task workflow
5. **Monitor performance**: Check query speed with many memories

Remember: The goal is to build a valuable knowledge base that improves over time. Test with real scenarios you'd encounter in daily development! 