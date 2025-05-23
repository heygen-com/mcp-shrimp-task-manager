# Testing the Translation Tool

This guide helps you test all features of the `translate_content` tool, including persistence, learning, and agent-to-agent dialog.

## Prerequisites

1. **Set up OpenAI API Key**:
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   # Or add to .env file
   ```

2. **Build the project**:
   ```bash
   npm run build
   ```

## Testing Methods

### Method 1: Direct Testing via Scripts (Recommended)

We've created comprehensive test scripts:

#### 1. **Run Feature Tests**
```bash
node scripts/test-translation-features.js
```

This script tests:
- ✅ Basic translation with domains
- ✅ Context-aware translations (same word, different meanings)
- ✅ Translation memory persistence
- ✅ Agent-to-agent dialog
- ✅ Multiple domain support
- ✅ Memory statistics

#### 2. **Inspect Persisted Data**
```bash
node scripts/inspect-translation-memory.js
```

This shows:
- 📊 Translation statistics
- 🔝 Most used translations
- 📅 Recent translations
- 💬 Dialog history
- 💾 Storage analysis

### Method 2: Testing via MCP Client (Cursor/Claude)

#### Test 1: Basic Translation
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "Submit",
    "targetLanguage": "zh-TW",
    "domain": "ui"
  }
}
```

#### Test 2: Context Disambiguation
First, translate "charge" in financial context:
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "charge",
    "targetLanguage": "zh-TW",
    "context": "credit card payment",
    "domain": "finance"
  }
}
```

Then, translate "charge" in technical context:
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "charge",
    "targetLanguage": "zh-TW",
    "context": "battery level indicator",
    "domain": "technical"
  }
}
```

#### Test 3: Agent-to-Agent Dialog
Start a dialog for ambiguous content:
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "The application crashed",
    "targetLanguage": "es",
    "requestClarification": true
  }
}
```

The tool will respond with a dialog ID and clarification question. Continue with:
```json
{
  "tool": "translate_content",
  "arguments": {
    "content": "The application crashed",
    "targetLanguage": "es",
    "previousDialogId": "dialog_xxxxx_xxx",
    "context": "mobile app stopped working on iPhone"
  }
}
```

## Verifying Persistence

### Where Data is Stored

Check your `DATA_DIR` (configured in your MCP settings):

```
DATA_DIR/
└── translation_memory/
    ├── en_to_zh-TW.json     # English to Chinese translations
    ├── en_to_es.json        # English to Spanish translations
    ├── en_to_fr.json        # English to French translations
    └── dialogs/             # Agent conversations
        ├── dialog_xxx.json
        └── dialog_yyy.json
```

### Manual Inspection

1. **View translation memory**:
   ```bash
   cat $DATA_DIR/translation_memory/en_to_zh-TW.json | jq '.'
   ```

2. **Check specific translation**:
   ```bash
   cat $DATA_DIR/translation_memory/en_to_zh-TW.json | jq '.[] | select(.sourceText == "Submit")'
   ```

3. **View dialog history**:
   ```bash
   ls $DATA_DIR/translation_memory/dialogs/
   cat $DATA_DIR/translation_memory/dialogs/dialog_*.json | jq '.'
   ```

## Testing Persistence Features

### 1. **Usage Count Test**
Translate the same content multiple times:
```bash
# Run this multiple times
curl -X POST ... # Your MCP endpoint
```

Then check the usage count increases:
```bash
node scripts/inspect-translation-memory.js
# Look for "Used: X times"
```

### 2. **Memory Learning Test**
1. First translation (no memory):
   - Note: Tool searches memory, finds nothing
   - Makes fresh translation

2. Second translation (with memory):
   - Note: Tool finds previous translation
   - Uses it as reference
   - Confidence may increase

### 3. **Cross-Session Persistence**
1. Run some translations
2. Stop the MCP server
3. Restart the MCP server
4. Run the same translation
5. Verify it remembers previous translations

### 4. **Domain-Specific Memory**
Test how the same word gets different translations per domain:
```bash
# Educational domain
"credit" → "學分" (academic credits)

# Financial domain  
"credit" → "信用" (financial credit)

# Both stored separately in memory
```

## Advanced Testing

### Test Translation Consistency
```javascript
// Create a test file: test-consistency.js
const terms = [
  "Submit", "Cancel", "Save", "Delete", "Edit",
  "Error", "Success", "Loading", "Please wait"
];

for (const term of terms) {
  // Translate each UI term
  await translateContent({
    content: term,
    targetLanguage: "zh-TW",
    domain: "ui"
  });
}

// Run inspector to see consistent translations
```

### Test Memory Growth
1. Check initial memory size:
   ```bash
   du -h $DATA_DIR/translation_memory/
   ```

2. Run many translations
3. Check size again
4. Note: Memory is sorted by usage, keeping most relevant translations accessible

## Troubleshooting

### No Data Persisting?
1. Check `DATA_DIR` is set correctly:
   ```bash
   echo $DATA_DIR
   ```

2. Check write permissions:
   ```bash
   ls -la $DATA_DIR/
   ```

3. Check for errors in MCP server logs

### Translations Not Improving?
1. Ensure you're using the same domain/context
2. Check confidence scores are increasing
3. Verify memory file is being updated

### Dialog Not Working?
1. Ensure `requestClarification: true` is set
2. Save the dialog ID from response
3. Use exact same content in follow-up

## Expected Results

After testing, you should see:

1. **Memory Files**: JSON files for each language pair
2. **Growing Usage Counts**: Frequently used translations have higher counts
3. **Improving Confidence**: Repeated translations show higher confidence
4. **Dialog Preservation**: Completed dialogs saved for reference
5. **Domain Separation**: Same terms translated differently per domain

## Performance Notes

- First translation: ~1-2 seconds (OpenAI API call)
- Repeated translation: Faster (memory reference)
- Memory lookup: O(n) but sorted by usage
- Storage: ~1KB per unique translation 