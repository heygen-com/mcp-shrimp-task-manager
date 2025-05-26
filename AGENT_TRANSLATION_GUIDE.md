# Agent Translation Tool Guide

## Overview
The `translate_content` tool has been optimized for agent usage with **JSON-first output** and comprehensive agent integration features.

## Key Changes for Agents

### 🎯 JSON is Now Default
- **No need to specify `returnFormat`** - JSON is the default
- **Structured responses** that are easy to parse
- **Consistent format** across all translations

### 📋 Simple Usage Pattern
```javascript
// Basic translation - returns JSON by default
const result = await translateContent({
  content: "Save",
  targetLanguage: "pt-BR",
  domain: "ui",
  context: "Save button in form"
});

// Parse the JSON response
const translation = JSON.parse(result.content[0].text);
console.log(translation.translation); // "Salvar"
```

## Response Structure

### Standard Translation Response
```json
{
  "translation": "Salvar",           // The translated text
  "confidence": 0.95,               // Confidence score (0-1)
  "alternatives": ["Guardar"],      // Alternative translations
  "explanation": "Direct translation for UI save action",
  "domain_notes": "Common UI term",
  "domain": "ui",                   // Domain used
  "context": "Save button in form", // Context provided
  "source": "new_translation"      // "new_translation" or "cache"
}
```

### Clarification Response
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

## Agent Integration Patterns

### 1. Single Translation
```javascript
async function translateTerm(term, targetLang, context) {
  try {
    const result = await translateContent({
      content: term,
      targetLanguage: targetLang,
      domain: "ui",
      context: context
    });
    
    const translation = JSON.parse(result.content[0].text);
    return translation.translation;
  } catch (error) {
    console.error("Translation failed:", result.content[0].text);
    return term; // Fallback to original
  }
}
```

### 2. Batch Translation
```javascript
async function translateBatch(terms, targetLang, domain) {
  const translations = {};
  
  for (const [key, term] of Object.entries(terms)) {
    const result = await translateContent({
      content: term,
      targetLanguage: targetLang,
      domain: domain,
      context: `UI element: ${key}`
    });
    
    try {
      const translation = JSON.parse(result.content[0].text);
      translations[key] = translation.translation;
    } catch (error) {
      translations[key] = term; // Fallback
    }
  }
  
  return translations;
}
```

### 3. High-Quality Translation with Clarification
```javascript
async function translateWithClarification(term, targetLang, domain) {
  // First attempt with clarification enabled
  let result = await translateContent({
    content: term,
    targetLanguage: targetLang,
    domain: domain,
    requestClarification: true
  });
  
  let response = JSON.parse(result.content[0].text);
  
  // Handle clarification dialog
  if (response.clarificationNeeded) {
    // Provide more specific context
    result = await translateContent({
      content: term,
      targetLanguage: targetLang,
      domain: domain,
      context: "Specific context based on clarification question",
      previousDialogId: response.dialogId
    });
    
    response = JSON.parse(result.content[0].text);
  }
  
  return response;
}
```

## Best Practices for Agents

### ✅ Do
1. **Always provide context and domain** for better translations
2. **Parse JSON responses** with try-catch error handling
3. **Check confidence scores** - values below 0.8 may need review
4. **Use consistent domain values** across related translations
5. **Handle clarification dialogs** for ambiguous terms
6. **Cache translations** by checking the "source" field

### ❌ Don't
1. Don't skip error handling when parsing JSON
2. Don't ignore confidence scores
3. Don't use generic contexts like "text" or "content"
4. Don't translate the same term multiple times without checking cache

## Error Handling

```javascript
async function safeTranslate(content, targetLanguage, options = {}) {
  try {
    const result = await translateContent({
      content,
      targetLanguage,
      ...options
    });
    
    // Try to parse as JSON
    const translation = JSON.parse(result.content[0].text);
    return {
      success: true,
      translation: translation.translation,
      confidence: translation.confidence,
      alternatives: translation.alternatives
    };
  } catch (error) {
    // If JSON parsing fails, it's an error message
    return {
      success: false,
      error: result.content[0].text,
      fallback: content
    };
  }
}
```

## Translation Memory Benefits

- **Instant retrieval** of previously translated terms
- **Consistency** across your application
- **Learning** from context patterns
- **Confidence improvement** over time
- **Cost savings** by reusing cached translations

## Common Use Cases

### UI Translation
```javascript
const uiTerms = {
  save: "Save",
  cancel: "Cancel", 
  submit: "Submit",
  delete: "Delete"
};

const translated = await translateBatch(uiTerms, "pt-BR", "ui");
```

### Error Messages
```javascript
const errorMsg = await translateTerm(
  "Invalid email address",
  "es",
  "Form validation error message"
);
```

### Dynamic Content
```javascript
const notification = await translateTerm(
  `Welcome back, ${userName}!`,
  "fr",
  "User greeting notification"
);
```

## Migration from Old Usage

### Before (formatted output)
```javascript
// Old way - had to parse markdown
const result = await translateContent({
  content: "Save",
  targetLanguage: "pt-BR",
  returnFormat: "formatted"
});

// Complex parsing required
const translation = result.content[0].text.match(/\*\*Target.*?\*\*\s*"(.+?)"/)?.[1];
```

### After (JSON output)
```javascript
// New way - clean JSON parsing
const result = await translateContent({
  content: "Save",
  targetLanguage: "pt-BR"
  // returnFormat defaults to "json"
});

// Simple JSON parsing
const translation = JSON.parse(result.content[0].text).translation;
```

## Performance Tips

1. **Batch related translations** to reduce API calls
2. **Use translation memory** - check if `source: "cache"`
3. **Provide specific context** to improve cache hit rates
4. **Use consistent domain values** for better memory organization
5. **Handle errors gracefully** to avoid breaking workflows

---

**The translation tool is now optimized for agent workflows with JSON-first responses, making it easy to integrate reliable, context-aware translations into your automation.** 