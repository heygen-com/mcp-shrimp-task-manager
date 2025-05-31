# Memory Storage System

## Overview
The memory system stores each memory as an individual file for optimal scalability, performance, and management.

## Storage Format

Each memory is stored as an individual file:
- Filename format: `memory_YYYYMMDDHHMMSS.json`
- Example: `memory_20250531014523.json`
- Location: `${DATA_DIR}/memories/`

### Benefits
1. **Better Performance**: No need to load/save large files when accessing a single memory
2. **Easier Management**: Can delete, backup, or modify individual memories
3. **Scalability**: System can handle thousands of memories without performance degradation
4. **Conflict Resolution**: Reduces the chance of conflicts when multiple processes access memories
5. **Debugging**: Easier to inspect and debug individual memories

## Index System
- `_index.json`: Maps memory IDs to filenames and maintains all indices
- `_stats.json`: Aggregated statistics about memories

## Example Memory File

`memory_20250531014523.json`:
```json
{
  "content": "When working on localization (i18n) string extraction...",
  "summary": "Use ICU Message Format for i18n projects",
  "type": "pattern",
  "confidence": 0.8,
  "tags": ["i18n", "localization", "ICU", "translation"],
  "entities": ["ICU Message Format", "i18next"],
  "id": "mem_1748681950340_nrs0enwdu",
  "version": 1,
  "created": "2025-05-31T08:59:10.340Z",
  "lastAccessed": "2025-05-31T08:59:10.340Z",
  "accessCount": 0,
  "relevanceScore": 1,
  "archived": false
}
```

## File Structure
```text
memories/
├── _index.json                      # Memory index and mappings
├── _stats.json                      # Statistics
├── memory_20250531015910.json       # Individual memory
├── memory_20250531020145.json       # Another memory
└── ...
```

## How It Works
1. Each memory is saved with a timestamp-based filename
2. The index maintains mappings from memory IDs to filenames
3. Queries use the index to efficiently find memories
4. Only relevant memory files are loaded when needed

## Using the Memory System
- All memory tools work transparently with this storage format
- No special configuration needed
- Memories are automatically indexed and searchable 