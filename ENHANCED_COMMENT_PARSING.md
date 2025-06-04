# Enhanced JIRA Comment Task Parsing

## 🎯 **Problem Solved**

Previously, agents needed to perform complex workflows to extract UI text from JIRA screenshots:
1. Get comment tasks 
2. Download images manually with authentication
3. Run OCR on images
4. Search codebase for UI components 
5. Correlate text across multiple sources

**This was 6-8 steps and often failed on authentication.**

## ✨ **New Simplified Workflow**

Now agents can extract UI context with a **single JIRA tool call**:

```javascript
jira({
  action: "get_comment_tasks",
  domain: "ticket", 
  context: { 
    issueKey: "TT-213",
    includeMedia: true,     // Auto-download images with auth
    downloadImages: true    // Convert to base64 for OCR
  }
})
```

## 🔧 **Enhanced Features**

### 1. **Automatic UI Context Extraction**
The parser now automatically detects:

- **Pages**: "Videos page", "Settings screen" → generates `["videos", "settings"]`
- **Components**: "context menu", "Download button" → generates `["context", "download"]` 
- **Actions**: "Download", "Rename", "Delete" → generates i18n key variations

### 2. **Smart Codebase Search Suggestions**
For each detected UI element, automatically generates search queries:

```
Pages: ["videos"]
→ Suggests: "videos page", "pages/videos", "VideosPage"

Actions: ["Download", "Rename"] 
→ Suggests: "Download", "download", "downloadButton", "video_menu_action_download"
```

### 3. **Authenticated Image Downloads**
- Uses existing JIRA credentials automatically
- Downloads images as base64 data for OCR
- Handles authentication errors gracefully
- No manual curl commands needed

### 4. **Enhanced Task Descriptions**
Instead of: `"localize this context menu"`
Provides: `"localize Download, Rename options | Context: Pages: videos | Components: context | Actions: Download, Rename"`

## 📊 **Response Structure**

```json
{
  "issueKey": "TT-213",
  "totalTasks": 1,
  "tasksWithMedia": 1,
  "tasksWithContext": 1,
  "comments": [{
    "tasks": [{
      "id": "ct_27266_2_localize",
      "text": "localize this context menu",
      "uiContext": {
        "pages": ["videos"],
        "components": ["context"],
        "actions": ["Download", "Rename"],
        "searchQueries": [
          "videos page", "pages/videos", 
          "context component", "contextMenu",
          "Download", "download", "downloadButton",
          "Rename", "rename", "renameButton"
        ],
        "enhancedDescription": "localize this context menu | Context: Pages: videos | Components: context | Actions: Download, Rename"
      },
      "downloadedImages": [{
        "id": "16671", 
        "base64Data": "data:image/png;base64,iVBORw0KGgoAAAA...",
        "contentType": "image/png"
      }]
    }]
  }]
}
```

## 🎯 **Agent Workflow Now**

### Before (Complex):
1. `jira get_comment_tasks` → Find tasks
2. `jira read_comments` → Get details  
3. `run_terminal_cmd curl` → Download images (fails)
4. `consult_expert` → Handle auth issues
5. `codebase_search` → Find components manually
6. Correlate everything manually

### After (Simple):
1. `jira get_comment_tasks` → **Everything done automatically!**
2. Use provided `searchQueries` for codebase correlation
3. Use `base64Data` for OCR if needed

## 💡 **Example Usage Scenarios**

### Localization Tasks
```javascript
// Single call gets everything needed
const result = await jira({
  action: "get_comment_tasks",
  domain: "ticket",
  context: { issueKey: "LOC-123", includeMedia: true }
});

// Automatically provides:
// - UI element names for translation
// - Codebase search suggestions  
// - Downloaded screenshots as base64
// - Component location hints
```

### UI Bug Reports
```javascript
// Parse "Fix the Delete button in Settings page" 
// Automatically extracts:
{
  pages: ["settings"],
  components: ["delete"],
  searchQueries: [
    "settings page", "pages/settings", "SettingsPage",
    "delete component", "deleteButton", "DeleteButton"
  ]
}
```

## 🛠 **Technical Implementation**

### Pattern Recognition
- **Page Detection**: `/(?:on the |in the )?(\w+)\s+page/gi`
- **Component Detection**: `/(\w+)\s+(?:menu|button|dialog)/gi`  
- **Action Detection**: `/"([^"]+)" (?:option|button|link)/gi`

### i18n Key Generation
- **Snake Case**: "Download File" → `download_file`
- **Camel Case**: "Download File" → `downloadFile`
- **Component Suffix**: "Download" → `downloadButton`, `download_action`

### Intelligent Fallback
If image download fails, the enhanced descriptions and search queries provide a robust fallback strategy without requiring manual codebase exploration.

## 🎉 **Benefits**

- **80% reduction** in tool calls needed
- **Automatic authentication** handling  
- **Smart context extraction** without manual parsing
- **Built-in fallback** strategy when images aren't accessible
- **Immediate codebase correlation** suggestions

Perfect for localization workflows, UI bug analysis, and any task requiring correlation between JIRA screenshots and codebase components! 