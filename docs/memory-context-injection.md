# Memory Context Injection for Projects

## Overview
When you open a project using the `project` tool with `action: "open"`, the system automatically injects relevant memories to provide context. This feature is particularly powerful for specialized projects like localization/i18n work.

## How It Works

### 1. Direct Project Memories
The system first loads memories that are directly associated with the project ID. These are memories recorded while working on that specific project.

### 2. Tag and Content-Based Memories
The system then searches for additional relevant memories based on:

#### For Localization/i18n Projects
If your project is detected as a localization project (based on name, description, or tags), the system automatically searches for memories tagged with:
- `i18n`
- `localization`
- `translation`
- `ICU`

Detection criteria:
- Project has tags like "i18n", "localization", "translation", or "internationalization"
- Project name includes "i18n", "localization", or "translation"
- Project description mentions these terms

#### For Other Projects
The system matches memories that share tags with your project, helping surface relevant patterns and decisions from similar work.

## Example: ICU Message Format Memory

When you open a localization project, your ICU Message Format pattern memory will automatically be included because it has:
- Tags: `["i18n", "localization", "ICU", "translation", "best-practices"]`
- Type: `pattern`
- High relevance for localization work

This memory will appear in the "Related Global Memories" section, reminding you to:
- Use ICU format for pluralization
- Handle gender/select cases properly
- Format numbers, dates, and currencies with locale awareness
- Identify patterns during string extraction that would benefit from ICU

## Memory Display Structure

```
## 📚 Project Memory Context

### Project-Specific Memories (X)
Memories directly linked to this project

### Related Global Memories (Y)
Memories that match your project's context
```

## Benefits

1. **Automatic Context Loading**: No need to manually search for relevant memories
2. **Cross-Project Learning**: Patterns and best practices from other projects are automatically surfaced
3. **Specialized Knowledge**: Domain-specific memories (like ICU formatting for i18n) are injected when relevant
4. **Progressive Enhancement**: The more memories you record, the richer the context becomes

## Best Practices

1. **Tag Memories Appropriately**: Use consistent tags like "i18n", "localization", "security", "performance"
2. **Record Patterns**: Document patterns and best practices as memories for future reference
3. **Use Descriptive Summaries**: Clear summaries help the relevance scoring system
4. **Review Injected Memories**: Use `query_memory` to explore specific memories in detail

## Future Enhancements

The system continuously improves its matching algorithms based on:
- Entity extraction and matching
- Semantic similarity scoring
- Access patterns and user behavior
- Memory chains and relationships 