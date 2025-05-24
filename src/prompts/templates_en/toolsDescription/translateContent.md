## Translate Content Tool

This tool provides high-quality, context-aware translations using OpenAI with translation memory support for consistency and efficiency.

### Key Features:
- Context-aware translations with domain support
- Translation memory caching for instant retrieval of previous translations
- Dialog-based clarification for ambiguous terms
- Confidence scoring and alternative translations
- Preserves special formatting and interpolation variables
- Learns from previous translations to improve consistency

### When to Use:
- Translating UI text, documentation, or any content
- When you need consistent translations across a project
- For ambiguous terms that require context (e.g., "credit" in different domains)
- When you want to build a translation memory for future use

### Parameters:
- **content**: The text to translate
- **targetLanguage**: Target language code (e.g., "ko", "pt-BR", "zh-TW")
- **sourceLanguage**: Source language code (default: "en")
- **context**: Optional context about usage (e.g., "button label on payment page")
- **domain**: Optional domain category (e.g., "ui", "finance", "education")
- **requestClarification**: Whether to ask for clarification if ambiguous
- **previousDialogId**: Continue a previous translation dialog
- **verbose**: Enable detailed logging for debugging

The tool maintains a translation memory that improves over time, providing instant translations for previously seen content. 