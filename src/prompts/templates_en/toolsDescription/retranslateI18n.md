## Retranslate i18n Tool

This tool automatically retranslates i18n JSON files from English source to multiple target languages, preserving existing translations and maintaining JSON structure.

### Key Features:
- Batch translation of entire namespaces
- Preserves existing translations (only translates missing keys)
- Maintains JSON structure and formatting
- Uses translation memory for consistency
- Supports multiple target locales in one operation
- Dry-run mode for previewing changes
- Detailed progress reporting
- Protects interpolation variables and special formatting

### When to Use:
- After adding new English keys to your i18n files
- When setting up translations for a new locale
- To update translations for specific namespaces
- For batch translation of multiple language files

### Parameters:
- **projectPath**: Absolute path to the project root
- **localesBasePath**: Relative path to locales directory (e.g., "packages/movio/public/locales")
- **sourceLocale**: Source locale directory name (default: "en-US")
- **namespace**: The namespace file to translate (e.g., "Home", "Auth")
- **targetLocales**: Array of target locale codes (e.g., ["ko-KR", "pt-BR"])
- **preserveExisting**: Keep existing translations (default: true)
- **dryRun**: Preview changes without writing files
- **domain**: Translation domain for context (e.g., "ui", "marketing")
- **verbose**: Enable detailed logging

Example: Retranslate Home.json from en-US to ko-KR and pt-BR for a specific project. 