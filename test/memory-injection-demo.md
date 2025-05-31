# Memory Injection Demo: Localization Project

## Step 1: Create a Localization Project

```
Tool: project
Arguments: {
  "action": "create",
  "name": "HeyGen i18n String Extraction",
  "description": "Extract and prepare strings for translation in the HeyGen platform",
  "goals": [
    "Extract all hardcoded strings from React components",
    "Create i18n keys following naming conventions",
    "Implement ICU Message Format for complex strings",
    "Set up translation workflow"
  ],
  "tags": ["i18n", "localization", "react", "heygen"]
}
```

## Step 2: Open the Project

```
Tool: project
Arguments: {
  "action": "open",
  "projectId": "[PROJECT_ID_HERE]"
}
```

## Expected Output

When you open this localization project, you'll see:

```
# HeyGen i18n String Extraction

[Standard project information...]

## 📚 Project Memory Context

### Project-Specific Memories (0)
(None yet - this is a new project)

### Related Global Memories (1)

*These memories match your project's context and may be helpful:*

#### Pattern
- **Use ICU Message Format for i18n projects, especially for plurals, gender, conditionals, and formatting**
  Tags: i18n, localization, ICU, translation, best-practices
  Relevance: 95%

💡 *Use 'query_memory' to explore specific memories in detail.*
```

## Why This Works

1. **Project Detection**: The system detects this is a localization project because:
   - It has the "i18n" and "localization" tags
   - The name includes "i18n"
   - The description mentions "translation"

2. **Memory Matching**: Your ICU Message Format memory is automatically included because:
   - It has matching tags: "i18n", "localization", "ICU", "translation"
   - It's marked as a "pattern" type memory
   - It has high relevance for localization work

3. **Context Enhancement**: The agent now has immediate access to:
   - ICU Message Format best practices
   - Pluralization rules
   - Gender/select case handling
   - Number/date/currency formatting guidelines

## Testing with Other Project Types

Try creating projects with different tags to see how memory injection adapts:

### Security Project
```
Tags: ["security", "authentication", "api"]
```
Will match memories tagged with security-related terms

### Performance Project
```
Tags: ["performance", "optimization", "react"]
```
Will match memories about performance patterns and optimizations

### Data Pipeline Project
```
Tags: ["data", "etl", "pipeline", "kafka"]
```
Will match memories about data processing patterns 