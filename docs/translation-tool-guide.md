# Translation Tool Guide

The `translate_content` tool provides context-aware translations with learning capabilities, agent-to-agent dialog support, and translation memory that improves over time.

## Key Features

- **Context-Aware Translations**: Understands context to provide accurate translations (e.g., distinguishing between "credit" in educational vs financial contexts)
- **Agent-to-Agent Dialog**: Secondary translation agent can request clarification when context is ambiguous
- **Translation Memory**: Learns from past translations and improves consistency over time
- **Multi-Language Support**: Works with any target language supported by OpenAI
- **Domain-Specific Patterns**: Maintains domain-specific translation patterns
- **Confidence Scoring**: Provides confidence scores and alternative translations

## Basic Usage

### Simple Translation
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "Please enter your credit card number",
    "targetLanguage": "zh-TW",
    "domain": "finance"
  }
}
```

### Translation with Context
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "credit",
    "targetLanguage": "es",
    "context": "Student needs 30 credits to graduate from the university program",
    "domain": "education"
  }
}
```

## Agent-to-Agent Dialog

When context is ambiguous, enable dialog mode:

```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "The application was rejected",
    "targetLanguage": "fr",
    "requestClarification": true
  }
}
```

The translator might respond with:
```
The translator needs clarification:

**Question:** Could you clarify what type of application was rejected? Is this:
1. A software application (app)?
2. A job/university application?
3. A loan/credit application?
4. Something else?

**Current best translation:** "La demande a été rejetée" (confidence: 70%)

To continue this dialog, use the `translate_content` tool again with:
- `previousDialogId`: "dialog_1234567890_abc"
- `context`: (provide the answer to the clarification question)
```

Continue the dialog:
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "The application was rejected",
    "targetLanguage": "fr",
    "previousDialogId": "dialog_1234567890_abc",
    "context": "This is about a mobile app submitted to the app store"
  }
}
```

## Translation Memory

The tool automatically builds translation memory over time. Each translation is stored with:
- Source and target text
- Context and domain
- Confidence score
- Usage statistics
- Dialog history (if any)

### Benefits of Translation Memory:
1. **Consistency**: Same terms are translated consistently across your project
2. **Learning**: The system learns from corrections and improves over time
3. **Speed**: Common translations are suggested based on past usage
4. **Context Preservation**: Domain and context information helps future translations

## Domain Categories

Common domains you can specify:
- `education` - Academic and educational content
- `finance` - Banking, payments, financial services
- `healthcare` - Medical and health-related content
- `legal` - Legal documents and terminology
- `technical` - Software, engineering, technical documentation
- `marketing` - Marketing copy and promotional content
- `ui` - User interface elements
- `error_messages` - Error messages and alerts
- `general` - General purpose content

## Advanced Examples

### Batch Translation with Domain
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "Error: Invalid credentials. Please check your username and password.",
    "targetLanguage": "ja",
    "domain": "error_messages",
    "context": "Login error message shown when authentication fails"
  }
}
```

### Technical Documentation
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "The API endpoint returns a JSON response with status code 200",
    "targetLanguage": "de",
    "domain": "technical",
    "context": "REST API documentation"
  }
}
```

### UI Elements with Alternatives
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "Submit",
    "targetLanguage": "zh-TW",
    "domain": "ui",
    "context": "Button text for form submission",
    "requestClarification": false
  }
}
```

## Translation Memory Structure

Translation memories are stored in `DATA_DIR/translation_memory/`:
```
translation_memory/
├── en_to_zh-TW.json     # English to Traditional Chinese
├── en_to_es.json        # English to Spanish
├── en_to_fr.json        # English to French
└── dialogs/             # Agent-to-agent dialog history
    ├── dialog_xxx.json
    └── dialog_yyy.json
```

## Best Practices

1. **Always Provide Context**: The more context you provide, the better the translation
2. **Use Domains**: Specify the domain to get more accurate, specialized translations
3. **Enable Dialog for Ambiguous Content**: When translating ambiguous terms, enable `requestClarification`
4. **Leverage Translation Memory**: The tool gets better over time as it learns your specific terminology
5. **Review High-Stakes Translations**: For critical content, review translations with lower confidence scores

## Integration with Task Management

When translating content related to a specific task, include the task ID:

```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "User authentication module",
    "targetLanguage": "ko",
    "taskId": "123e4567-e89b-12d3-a456-426614174000",
    "domain": "technical"
  }
}
```

This links the translation to the task for better context and tracking.

## Troubleshooting

### Missing OPENAI_API_KEY
Ensure your environment has the `OPENAI_API_KEY` set:
```bash
export OPENAI_API_KEY="your-api-key-here"
```

### Translation Memory Not Persisting
Check that `DATA_DIR` is properly configured and the process has write permissions to that directory.

### Low Confidence Scores
- Provide more context
- Specify the correct domain
- Use the dialog feature to clarify ambiguities

## Examples of Improved Translations

### Without Context
- Input: "charge"
- Output: "收費" (fee/cost)

### With Financial Context
- Input: "charge"
- Context: "credit card charge"
- Domain: "finance"
- Output: "信用卡扣款" (credit card charge)

### With Battery Context
- Input: "charge"
- Context: "battery charge level"
- Domain: "technical"
- Output: "充電" (battery charge)

This demonstrates how context and domain significantly improve translation accuracy. 