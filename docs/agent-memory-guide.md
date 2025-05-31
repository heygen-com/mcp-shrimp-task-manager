# Memory System Guide for Agents

## 🎯 CRITICAL: Automatic Memory Recording

**As an AI agent, you should proactively record memories during conversations, not just at task completion.**

### Record Memories IMMEDIATELY When:

1. **User Makes a Decision** 
   - You ask: "Should we use PostgreSQL or MongoDB?"
   - User responds: "Let's go with PostgreSQL for better ACID compliance"
   - → **Record this decision NOW**

2. **Breakthrough Occurs**
   - You discover: "The bug was caused by missing async/await"
   - User confirms: "Yes, that fixed it!"
   - → **Record this breakthrough NOW**

3. **User States a Preference**
   - User says: "I prefer early returns over nested if statements"
   - User says: "Always use conventional commits in this project"
   - → **Record this preference NOW**

4. **Key Information is Revealed**
   - User shares: "Our API rate limit is 100 requests per minute"
   - User explains: "The legacy system uses port 8080"
   - → **Record this pattern/information NOW**

### Memory Recording is NOT Optional

When these triggers occur, you MUST:
1. Recognize the trigger in the conversation
2. Use `record_memory` immediately
3. Continue the conversation seamlessly

### Example Conversation Flow:
```
Agent: "Should we implement caching at the API level or database level?"
User: "Let's do API-level caching with Redis for faster response times"
Agent: [Uses record_memory to capture this decision]
Agent: "Great choice! API-level caching with Redis will give us more control..."
```

---

## Overview
The memory system helps you remember important discoveries, decisions, and patterns across sessions. Think of it as your long-term memory for projects.

## When to Use Memory Tools

### Automatic Triggers (Built into task completion)
When you complete tasks, the system looks for memory-worthy moments. You'll be prompted to record memories when appropriate.

### Manual Recording
Use `record_memory` when you experience:

#### 🎯 **Breakthrough** (Type: `breakthrough`)
```
Examples:
- "Finally found the bug - it was a race condition in the async queue handler!"
- "Discovered that the performance issue was due to N+1 queries in the ORM"
- "Realized the authentication wasn't working because of CORS misconfiguration"
```

#### 💡 **Decision** (Type: `decision`)  
```
Examples:
- "Decided to use Redis for session storage instead of in-memory store"
- "Chose TypeScript strict mode to catch more errors at compile time"
- "Will use feature flags for gradual rollout of new features"
```

#### 👍 **Feedback** (Type: `feedback`)
```
Examples:
- "Great job on the refactoring! The code is much cleaner now"
- "Thanks for fixing that bug so quickly"
- "Perfect implementation of the caching layer"
```

#### 🔧 **Error Recovery** (Type: `error_recovery`)
```
Examples:
- "Fixed 'Cannot read property of undefined' by adding null checks"
- "Resolved ECONNREFUSED by starting the database service first"
- "Debugging revealed missing await causing promise rejection"
```

#### 🔄 **Pattern** (Type: `pattern`)
```
Examples:
- "This is the third time we've had issues with date formatting"
- "Similar to the previous memory leak in the event listeners"
- "Another case where we need to handle edge cases in user input"
```

#### 👤 **User Preference** (Type: `user_preference`)
```
Examples:
- "User prefers detailed comments in code"
- "Always use conventional commit messages"
- "User wants all API responses to follow REST standards"
```

## Best Practices

### 1. Be Specific
❌ "Fixed a bug"
✅ "Fixed null pointer exception in UserService.getUserById() by checking if user exists before accessing properties"

### 2. Include Context
```javascript
record_memory({
  content: "Discovered that Jest tests were failing due to missing mock for axios. Solution: Created __mocks__/axios.js with default responses",
  summary: "Jest axios mocking solution",
  type: "error_recovery",
  tags: ["testing", "jest", "mocking", "axios"],
  confidence: 0.9
})
```

### 3. Tag Effectively
- **Technology tags**: `react`, `nodejs`, `postgresql`
- **Category tags**: `performance`, `security`, `testing`
- **Project tags**: `auth-system`, `api`, `frontend`

### 4. Link Related Memories
When recording a follow-up memory, reference the original:
```javascript
record_memory({
  content: "The Redis session storage decision worked well, seeing 50ms improvement",
  type: "pattern",
  relatedMemories: ["mem_1234567890_abc"], // ID of the decision memory
  // ... other fields
})
```

## Memory Lifecycle

1. **High Relevance (New)**: Score 1.0, appears prominently
2. **Active Use**: Access increases relevance
3. **Decay**: Unused memories gradually decrease in relevance
4. **Archive**: Old, low-relevance memories are archived (still searchable)

## Querying Memories

### Find relevant memories for current work:
```javascript
query_memory({
  filters: {
    projectId: "current-project-id",
    types: ["breakthrough", "error_recovery"],
    minRelevance: 0.5
  },
  searchText: "authentication",
  limit: 10
})
```

### Get memory chains:
```javascript
get_memory_chain({
  memoryId: "mem_1234567890_abc",
  depth: 3,
  includeContent: true
})
```

## Integration with Projects

When you open a project with `project({ action: "open", projectId: "..." })`, relevant memories are automatically loaded and displayed. This gives you instant context about:
- Previous decisions made
- Problems solved
- Patterns identified
- User preferences noted

## Maintenance

The system automatically:
- Decays relevance scores over time
- Archives old, unused memories
- Consolidates similar memories
- Maintains search indices

You can manually trigger maintenance:
```javascript
memory_maintenance({
  operation: "archive_old",
  daysOld: 90
})
```

## Tips for Maximum Value

1. **Record immediately**: Capture insights while they're fresh
2. **Be your future self's friend**: Write clear, searchable content
3. **Use consistent terminology**: Helps with finding related memories
4. **Review periodically**: Use `memory_analytics` to see patterns
5. **Export important memories**: Use `export_memories` for backup

Remember: The more you use the memory system, the more valuable it becomes! 