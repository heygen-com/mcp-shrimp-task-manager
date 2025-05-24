## Consolidate Translation Memory Tool

This tool consolidates translation memory by extracting translations from all dialog files and merging them into the main translation memory. It removes duplicates, updates usage counts, and optionally cleans up processed dialog files.

### Key Features:
- Reads all completed dialog files from the translation memory directory
- Extracts translation pairs with confidence scores
- Merges with existing translation memory, keeping the best version of duplicates
- Updates usage counts for existing translations
- Provides detailed statistics and reports
- Optionally removes processed dialog files to save space

### When to Use:
- After running many translations to consolidate the results
- To clean up duplicate translations and optimize memory
- To improve translation consistency by merging all learned translations
- To reduce storage by removing completed dialog files

### Parameters:
- **sourceLanguage**: Source language code (default: "en")
- **targetLanguage**: Target language code (e.g., "ko", "pt-BR", "es-MS")
- **cleanupDialogs**: If true, removes processed dialog files after consolidation
- **dryRun**: If true, shows what would be consolidated without making changes

This tool helps maintain an efficient and accurate translation memory system by consolidating all translation knowledge into a single, optimized file. 