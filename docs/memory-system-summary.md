# Memory System Summary

## Quick Overview

The memory system is an AI agent's long-term memory, capturing breakthroughs, decisions, patterns, and preferences to improve future performance.

## Storage Location
- **Directory**: `{DATA_DIR}/memories/`
- **Files**: 
  - `memory_YYYYMMDDHHMMSS.json` - Individual memory files (e.g., `memory_20250531014523.json`)
  - `_index.json` - Fast lookup index
  - `_stats.json` - System statistics

## Memory Types & Examples

| Type | Icon | Trigger Keywords | Example |
|------|------|------------------|---------|
| **Breakthrough** | 🎯 | solved, fixed, discovered, realized, figured out | "Finally found the memory leak in the event listeners" |
| **Decision** | 💡 | decided, chose, will use, selected, opted for | "Decided to use React Query for server state management" |
| **Feedback** | 👍 | good work, thanks, excellent, perfect | "Great job on the API refactoring!" |
| **Error Recovery** | 🔧 | resolved error, fixed bug, debugging | "Fixed CORS by adding proper headers to Express" |
| **Pattern** | 🔄 | pattern, recurring, again, similar to | "Another case of forgetting to handle loading states" |
| **User Preference** | 👤 | prefer, like this, always, my style | "User prefers functional components over classes" |

## Core Tools

### Recording Memories
```javascript
record_memory({
  content: "Detailed description of what happened",
  summary: "Brief one-line summary",
  type: "breakthrough", // or other types
  tags: ["relevant", "tags"],
  confidence: 0.9, // 0-1 scale
  projectId: "optional-project-id"
})
```

### Querying Memories
```javascript
query_memory({
  filters: {
    projectId: "project-id",
    types: ["breakthrough", "decision"],
    minRelevance: 0.5
  },
  searchText: "authentication",
  limit: 10
})
```

### Memory Chains
```javascript
get_memory_chain({
  memoryId: "mem_123...",
  depth: 3,
  includeContent: true
})
```

## Agent Awareness

Agents become aware of memories through:

1. **Tool Discovery**: Memory tools appear in their tool list
2. **Project Integration**: When opening a project, relevant memories are auto-loaded
3. **Task Completion**: Prompts suggest recording memories after completing tasks
4. **Documentation**: The agent guide explains when and how to use memories

## Lifecycle

1. **Creation** (Score: 1.0) → New memories start with high relevance
2. **Access** → Each access boosts relevance slightly  
3. **Decay** → Unused memories gradually decrease in relevance (30-day half-life)
4. **Archive** → Old memories with score < 0.3 are archived (still searchable)

## Web Interface

Access at `http://localhost:{PORT}/memory-explorer.html` when `ENABLE_GUI=true`

Features:
- Search and filter memories
- View memory chains and relationships
- Export to JSON/Markdown
- Timeline visualization (planned)
- Relationship graph (planned)

## Best Practices

1. **Be Specific**: Include actual error messages, code snippets, reasoning
2. **Tag Consistently**: Use standard tags like technology names, categories
3. **Link Related**: Connect follow-up memories to originals
4. **Review Periodically**: Use analytics to find patterns
5. **Trust the System**: The more you use it, the more valuable it becomes

## Testing

See [Memory Testing Guide](./memory-testing-guide.md) for comprehensive examples.

Quick test:
```javascript
// Record a test memory
record_memory({
  content: "Test: Discovered console.log statements slow down production builds significantly",
  summary: "Console.log performance impact",
  type: "breakthrough",
  tags: ["performance", "debugging", "production"]
})

// Query it back
query_memory({ searchText: "console.log" })
```

## Integration Example

```javascript
// 1. Create project
project({ action: "create", name: "My App" })

// 2. Work on tasks - memories are recorded automatically
complete_task({ 
  taskId: "...", 
  summary: "Fixed the bug by adding null checks" 
})

// 3. Later, open project - memories provide context
project({ action: "open", projectId: "..." })
// Memories appear: "Previously fixed null pointer issues..."
```

Remember: Memories are your agent's accumulated wisdom. The system handles the complexity - you just need to record meaningful moments! 