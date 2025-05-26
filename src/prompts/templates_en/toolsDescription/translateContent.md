# translate_content Tool

## Purpose
**Agent-optimized translation tool** that provides context-aware, intelligent translation services with structured JSON responses for easy parsing and integration.

## Key Features
- **JSON-first output** designed for agent workflows and automation
- **Context-aware translations** using domain and context parameters
- **Agent-to-agent dialog** where the translator can request clarification when context is ambiguous
- **Translation memory system** that learns from past translations and improves over time
- **Protected terms** that never get translated (company names, technical terms)
- **Confidence scoring** and alternative translations

## Parameters

### Required
- `content` (string): The content to translate (can be a single term or multiple strings)
- `targetLanguage` (string): Target language code (e.g., "zh-TW", "es", "fr", "ja", "pt-BR")

### Optional
- `sourceLanguage` (string, default: "en"): Source language code
- `context` (string): Context about where/how this content is used (e.g., "educational credits in a student portal", "financial credits in banking app")
- `domain` (string): Domain/category for this translation (e.g., "education", "finance", "ui", "error_messages")
- `requestClarification` (boolean, default: false): Whether the secondary agent should request clarification if context is ambiguous
- `previousDialogId` (string): ID of previous dialog to continue conversation
- `returnFormat` (enum: "json" | "formatted", default: "json"): Return format - "json" for structured data (recommended for agents), "formatted" for human-readable markdown
- `taskId` (string): Optional task ID if this translation is related to a specific task
- `verbose` (boolean): Enable verbose logging for debugging

## Default JSON Output
**By default, this tool returns structured JSON that agents can easily parse:**

```json
{
  "translation": "translated content",
  "confidence": 0.95,
  "alternatives": ["alternative 1", "alternative 2"],
  "explanation": "brief explanation",
  "domain_notes": "domain-specific notes",
  "domain": "ui",
  "context": "button label",
  "source": "new_translation" // or "cache"
}
```

## Agent Usage Examples

### Basic Translation
```json
{
  "content": "Items",
  "targetLanguage": "pt-BR",
  "context": "Title for items section in uploads page",
  "domain": "ui"
}
```

### Translation with Clarification
```json
{
  "content": "credit",
  "targetLanguage": "zh-TW",
  "requestClarification": true
}
```

### Continue Dialog
```json
{
  "content": "credit",
  "targetLanguage": "zh-TW",
  "context": "This refers to academic credits in a university system",
  "previousDialogId": "dialog_1234567890_abc123def"
}
```

## Agent Integration Guide

### 1. Basic Translation Workflow
```javascript
const result = await translateContent({
  content: "Save",
  targetLanguage: "pt-BR",
  domain: "ui",
  context: "Save button in form"
});

const translation = JSON.parse(result.content[0].text);
console.log(translation.translation); // "Salvar"
```

### 2. Handling Clarification Dialogs
```javascript
const result = await translateContent({
  content: "bank",
  targetLanguage: "es",
  requestClarification: true
});

const response = JSON.parse(result.content[0].text);
if (response.clarificationNeeded) {
  // Continue dialog with more context
  const clarified = await translateContent({
    content: "bank",
    targetLanguage: "es",
    context: "Financial institution where money is stored",
    previousDialogId: response.dialogId
  });
}
```

### 3. Batch Translation Pattern
```javascript
const terms = ["Save", "Cancel", "Submit", "Delete"];
const translations = {};

for (const term of terms) {
  const result = await translateContent({
    content: term,
    targetLanguage: "pt-BR",
    domain: "ui",
    context: "Button labels in forms"
  });
  
  const translation = JSON.parse(result.content[0].text);
  translations[term] = translation.translation;
}
```

## Response Structure

### Successful Translation
```json
{
  "translation": "string",      // The translated text
  "confidence": 0.95,           // Confidence score (0-1)
  "alternatives": ["alt1"],     // Alternative translations
  "explanation": "string",      // Translation reasoning
  "domain_notes": "string",     // Domain-specific notes
  "domain": "ui",              // Domain used
  "context": "string",         // Context provided
  "source": "new_translation"  // "new_translation" or "cache"
}
```

### Clarification Needed
```json
{
  "dialogId": "dialog_123",
  "clarificationNeeded": true,
  "clarificationQuestion": "Are you referring to a financial bank or riverbank?",
  "currentTranslation": "banco",
  "confidence": 0.7,
  "alternatives": ["banco", "orilla"],
  "explanation": "Multiple meanings possible"
}
```

## Best Practices for Agents

1. **Always provide context and domain** for better translations
2. **Parse the JSON response** to extract the translation
3. **Check confidence scores** - values below 0.8 may need review
4. **Handle clarification dialogs** by providing more specific context
5. **Use consistent domain values** across related translations
6. **Cache translations** by checking the "source" field

## Translation Memory Benefits

- **Instant retrieval** of previously translated terms
- **Consistency** across your application
- **Learning** from context patterns
- **Confidence improvement** over time

## Error Handling

If translation fails, the tool returns an error message in the text field instead of JSON. Always wrap JSON.parse() in try-catch:

```javascript
try {
  const translation = JSON.parse(result.content[0].text);
  // Use translation.translation
} catch (error) {
  // Handle error - result.content[0].text contains error message
  console.error("Translation failed:", result.content[0].text);
}
``` 