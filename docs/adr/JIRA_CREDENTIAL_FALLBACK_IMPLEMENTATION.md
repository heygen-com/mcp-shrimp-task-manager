# JIRA Credential Fallback Implementation

## 🎯 Overview

Enhanced JIRA credential management with secure fallback support for MCP server configurations. This addresses the issue where environment variables are either insecure or overloaded, providing a clean separation between system-level and agent-specific credentials.

## 🔧 Implementation Details

### **Files Created/Modified**

1. **`src/utils/jiraCredentials.ts`** (NEW)
   - Centralized credential resolution utility
   - Multiple source support with priority ordering
   - Enhanced error reporting and debugging

2. **`src/tools/jiraTools.ts`** (MODIFIED)
   - Updated `getJiraEnv()` to use centralized utility
   - Enhanced logging with credential source information

3. **`src/tools/jira/jiraCommentService.ts`** (MODIFIED)
   - Updated `getJiraEnv()` to use centralized utility
   - Consistent error handling across all comment operations

## 🔐 Credential Sources (Priority Order)

### 1. **Primary Environment Variables** (Highest Priority)
```bash
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_USER_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-api-token-here
```

### 2. **MCP Server Config Fallback** (Secure Agent Deployment)
```bash
MCP_JIRA_BASE_URL=https://your-company.atlassian.net
MCP_JIRA_USER_EMAIL=your-email@company.com
MCP_JIRA_API_TOKEN=your-api-token-here
```

## 📋 MCP Client Configuration

### **mcp.json Example**
```json
{
  "name": "shrimp-task-manager",
  "command": "node",
  "args": ["dist/index.js"],
  "env": {
    "MCP_JIRA_BASE_URL": "https://your-company.atlassian.net",
    "MCP_JIRA_USER_EMAIL": "your-email@company.com",
    "MCP_JIRA_API_TOKEN": "your-api-token-here"
  }
}
```

## ✅ Key Features

### **Security Advantages**
- **Credential Isolation**: Each agent instance can have separate credentials
- **Secure Storage**: Credentials stored in MCP client config instead of system environment
- **No System Pollution**: Avoids cluttering system-wide environment variables
- **Access Control**: MCP client controls credential access per tool

### **Operational Benefits**
- **Backward Compatibility**: Existing `.env` setups continue to work
- **Priority System**: Primary env vars override MCP config when both exist
- **Detailed Logging**: Shows which credential source was used
- **Enhanced Debugging**: Clear error messages indicating what's missing

### **Error Handling**
- **Multiple Source Validation**: Checks both primary and fallback sources
- **Helpful Error Messages**: Shows exactly which variables are missing
- **Configuration Examples**: Provides copy-paste configuration samples
- **Source Tracking**: Logs which credential source was successfully used

## 🔍 API Reference

### **Core Functions**

#### `resolveJiraCredentials(): CredentialResult`
Returns detailed information about credential resolution including:
- Found credentials (if any)
- Source used (primary_env | mcp_config | none)
- Error details for each source attempted

#### `getJiraCredentials(): JiraCredentials`
Returns valid credentials or throws with detailed error message including:
- Missing variable names for each source
- Configuration examples for both methods
- Troubleshooting guidance

#### `hasJiraCredentials(): boolean`
Non-throwing check for credential availability.

#### `getCredentialSource(): CredentialSource`
Returns information about which source provided credentials.

## 🧪 Testing

The implementation has been thoroughly tested with:

✅ **No credentials scenario**: Shows helpful error messages and examples  
✅ **MCP config only**: Successfully uses fallback credentials  
✅ **Primary env only**: Uses primary credentials as expected  
✅ **Both sources**: Correctly prioritizes primary over MCP config  
✅ **Build verification**: All TypeScript compilation passes  
✅ **Integration**: Works with all existing JIRA operations  

## 🚀 Usage Examples

### **Environment Variable Debug**
```javascript
import { getCredentialSource } from './utils/jiraCredentials.js';

const source = getCredentialSource();
console.log(`Using credentials from: ${source.source}`);
console.log(`Details: ${source.details}`);
```

### **Safe Credential Check**
```javascript
import { hasJiraCredentials } from './utils/jiraCredentials.js';

if (hasJiraCredentials()) {
  // Proceed with JIRA operations
} else {
  // Show configuration help
}
```

### **Error Handling**
```javascript
import { getJiraCredentials } from './utils/jiraCredentials.js';

try {
  const creds = getJiraCredentials();
  // Use credentials
} catch (error) {
  // Error message includes helpful configuration examples
  console.error(error.message);
}
```

## 🔧 Migration Guide

### **For Existing Users**
- **No changes required**: Existing `.env` files continue to work
- **Optional upgrade**: Move credentials to MCP config for better security

### **For New Deployments**
- **Recommended**: Use MCP config method for agent-specific credentials
- **Alternative**: Use environment variables for simple setups

### **For CI/CD Pipelines**
- **Use primary env vars**: Set `JIRA_*` variables in pipeline environment
- **MCP config ignored**: Pipeline environment takes precedence

## 🎉 Benefits Delivered

✅ **Secure credential management** with MCP client config support  
✅ **Backward compatibility** with existing environment variable setups  
✅ **Enhanced debugging** with detailed error messages and source tracking  
✅ **Agent isolation** allowing different credentials per agent instance  
✅ **Centralized implementation** reducing code duplication  
✅ **Production ready** with comprehensive error handling  

---

**Implementation Status**: ✅ **COMPLETE**

All JIRA tools now support the enhanced credential fallback system, providing secure and flexible authentication options for agent deployments. 