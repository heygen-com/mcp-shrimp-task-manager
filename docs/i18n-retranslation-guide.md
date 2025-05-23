# i18n Retranslation Tool Guide

The `retranslate_i18n` tool automates the translation of i18n JSON files from English to other languages, ensuring consistency and accuracy across your application's localization.

## Overview

This tool is designed specifically for projects using i18next with namespace-based translations. It:
- Reads English source JSON files
- Translates to multiple target languages
- Preserves existing translations
- Protects brand names and technical terms
- Maintains JSON structure and interpolation variables

## Prerequisites

1. **OpenAI API Key**: Required for translations
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

2. **Project Structure**: Expected i18n structure:
   ```
   packages/movio/public/locales/
   ├── en-US/
   │   ├── Auth.json
   │   ├── Home.json
   │   └── Welcome.json
   ├── pt-BR/
   ├── ko-KR/
   └── es-MS/
   ```

## Basic Usage

### Translate a Single Namespace

```javascript
{
  "tool": "retranslate_i18n",
  "arguments": {
    "projectPath": "/Users/co/dev/heygen/pacific",
    "namespace": "Auth"
  }
}
```

This will:
1. Read `/packages/movio/public/locales/en-US/Auth.json`
2. Translate to pt-BR, ko-KR, and es-MS
3. Only translate missing keys (preserves existing)
4. Save to respective locale folders

### Dry Run Mode

Test what would be translated without making changes:

```javascript
{
  "tool": "retranslate_i18n",
  "arguments": {
    "projectPath": "/Users/co/dev/heygen/pacific",
    "namespace": "Home",
    "dryRun": true
  }
}
```

### Retranslate Everything

Force retranslation of all keys (not just missing ones):

```javascript
{
  "tool": "retranslate_i18n",
  "arguments": {
    "projectPath": "/Users/co/dev/heygen/pacific",
    "namespace": "Welcome",
    "preserveExisting": false
  }
}
```

### Custom Target Languages

Translate to specific languages only:

```javascript
{
  "tool": "retranslate_i18n",
  "arguments": {
    "projectPath": "/Users/co/dev/heygen/pacific",
    "namespace": "Settings",
    "targetLanguages": ["pt-BR", "es-MS"]
  }
}
```

## Advanced Features

### Domain-Specific Context

The tool automatically determines context based on namespace:
- `Auth` → "Authentication and login interface"
- `Home` → "Main dashboard and home screen"
- `Billing` → "Payment and subscription management"

You can override with custom domain:

```javascript
{
  "tool": "retranslate_i18n",
  "arguments": {
    "projectPath": "/path/to/project",
    "namespace": "CustomNamespace",
    "domain": "healthcare"
  }
}
```

### Protected Terms

These terms are never translated:
- Company names: HeyGen, Apple, Google, Microsoft
- Auth providers: SSO, OAuth
- Technical terms: API, URL, UUID, JSON, CSV
- Cloud providers: AWS, Azure, GCP

### Interpolation Variables

The tool preserves i18next interpolation:
```json
{
  "greeting": "Hello, {{name}}!",
  "items_count": "You have {{count}} items"
}
```

These variables (`{{name}}`, `{{count}}`) are maintained in translations.

## Workflow Examples

### 1. Add New English Keys

When you add new keys to English files:

```bash
# 1. Add keys to en-US/Auth.json
# 2. Run retranslation
```

```javascript
{
  "tool": "retranslate_i18n",
  "arguments": {
    "projectPath": "/Users/co/dev/heygen/pacific",
    "namespace": "Auth"
  }
}
```

### 2. Review Before Applying

```bash
# 1. Dry run to see what will change
# 2. Review the report
# 3. Apply if satisfied
```

```javascript
// Step 1: Dry run
{
  "tool": "retranslate_i18n",
  "arguments": {
    "projectPath": "/path",
    "namespace": "Home",
    "dryRun": true
  }
}

// Step 2: Apply
{
  "tool": "retranslate_i18n",
  "arguments": {
    "projectPath": "/path",
    "namespace": "Home"
  }
}
```

### 3. Batch Process Multiple Namespaces

Create a script to process all namespaces:

```javascript
const namespaces = ['Auth', 'Home', 'Welcome', 'Settings', 'Billing'];

for (const namespace of namespaces) {
  await retranslate_i18n({
    projectPath: "/Users/co/dev/heygen/pacific",
    namespace: namespace
  });
}
```

## Output Report

The tool provides detailed reports:

```
# i18n Retranslation Report

**Namespace:** Auth
**Source:** /path/locales/en-US/Auth.json
**Total Keys:** 25
**Target Languages:** pt-BR, ko-KR, es-MS
**Mode:** LIVE
**Preserve Existing:** Yes

## pt-BR

📄 Found existing file with 20 keys
🔄 Translating...
✅ Successfully wrote /path/locales/pt-BR/Auth.json
📊 Translated 25 keys

### Sample Results:
- **login_button**: "Log In" → "Entrar"
- **forgot_password**: "Forgot Password?" → "Esqueceu a Senha?"
```

## Best Practices

1. **Always Dry Run First**: Test with `dryRun: true` before applying changes
2. **Review Translations**: Check the output for accuracy, especially domain-specific terms
3. **Preserve Existing**: Keep `preserveExisting: true` unless you need a full retranslation
4. **Version Control**: Commit before running to easily review/revert changes
5. **Incremental Updates**: Translate as you add new keys rather than bulk updates

## Troubleshooting

### Missing Keys in Output
- Check that English source file has the keys
- Verify JSON syntax is valid
- Ensure proper nesting structure

### Wrong Context
- Override with custom domain parameter
- Add more specific context in the English values

### Protected Terms Translated
- Check if term is in DO_NOT_TRANSLATE list
- Terms are case-insensitive and match whole words

### Performance
- Large files may take time (1-2s per key)
- Translation memory improves speed over time
- Consider splitting very large namespaces

## Integration with Development Workflow

### Pre-commit Hook
```bash
#!/bin/bash
# Check for untranslated keys
node check-translations.js || exit 1
```

### CI/CD Pipeline
```yaml
- name: Validate Translations
  run: |
    npm run retranslate:dry-run
    npm run validate:i18n
```

### VS Code Task
```json
{
  "label": "Retranslate Current Namespace",
  "type": "shell",
  "command": "node",
  "args": [
    "retranslate.js",
    "${fileBasenameNoExtension}"
  ]
}
```

## Example: Complete Workflow

1. **Developer adds new feature with English strings**:
   ```json
   // en-US/Feature.json
   {
     "feature_title": "New Feature",
     "feature_description": "This feature allows {{action}}"
   }
   ```

2. **Run retranslation**:
   ```javascript
   retranslate_i18n({
     projectPath: "/project",
     namespace: "Feature"
   })
   ```

3. **Results**:
   - pt-BR: "Novo Recurso", "Este recurso permite {{action}}"
   - ko-KR: "새 기능", "이 기능은 {{action}}을 허용합니다"
   - es-MS: "Nueva Función", "Esta función permite {{action}}"

4. **Verify and commit**:
   ```bash
   git add locales/
   git commit -m "feat: add translations for new feature"
   ```

The tool ensures consistent, accurate translations while respecting i18n best practices and maintaining your application's terminology. 