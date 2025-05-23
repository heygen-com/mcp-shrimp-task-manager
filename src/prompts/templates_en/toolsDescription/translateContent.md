Performs context-aware translations with learning capabilities. Supports agent-to-agent dialog for clarification when context is ambiguous. Automatically builds and references translation memory to improve consistency over time.

Features:
- Context-aware translations that consider domain and usage context (e.g., "credit" in educational vs financial contexts)
- Agent-to-agent dialog support - the translator can ask clarifying questions when needed
- Translation memory that learns from past translations and improves over time
- Support for multiple target languages
- Domain-specific translation patterns
- Confidence scoring and alternative translations

The tool maintains translation memory in `DATA_DIR/translation_memory/` organized by language pairs. Each translation is stored with context, domain, confidence score, and usage statistics to improve future translations. 