Automatically retranslates i18n JSON files from English to other languages using context-aware translation. Takes an English namespace file and generates accurate translations for all target languages.

Features:
- Reads English JSON source files and translates to pt-BR, ko-KR, es-MS
- Preserves existing translations by default (only translates missing keys)
- Protects company names, product names, and technical terms from translation
- Maintains JSON structure including nested objects
- Preserves interpolation variables ({{variable}})
- Provides namespace-specific context for accurate translations
- Supports dry-run mode to preview changes before applying

Usage: Provide the project path and namespace name. The tool will automatically handle the translation of all keys while respecting i18n best practices like preserving brand names and technical terms. 