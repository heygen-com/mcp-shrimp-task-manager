/**
 * JIRA Credentials Utility
 * 
 * Provides centralized credential resolution with multiple fallback sources:
 * 1. Primary environment variables (JIRA_*)
 * 2. MCP server config environment variables (MCP_JIRA_*)
 * 3. Detailed error reporting for troubleshooting
 */

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface CredentialSource {
  source: 'primary_env' | 'mcp_config' | 'none';
  details: string;
}

export interface CredentialResult {
  credentials?: JiraCredentials;
  source: CredentialSource;
  errors: string[];
}

/**
 * Resolve JIRA credentials from multiple sources with detailed logging
 */
export function resolveJiraCredentials(): CredentialResult {
  const errors: string[] = [];
  
  // Try primary environment variables first
  const primaryBaseUrl = process.env.JIRA_BASE_URL;
  const primaryEmail = process.env.JIRA_USER_EMAIL;
  const primaryApiToken = process.env.JIRA_API_TOKEN;
  
  if (primaryBaseUrl && primaryEmail && primaryApiToken) {
    return {
      credentials: {
        baseUrl: primaryBaseUrl,
        email: primaryEmail,
        apiToken: primaryApiToken
      },
      source: {
        source: 'primary_env',
        details: 'Retrieved from primary environment variables (JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN)'
      },
      errors: []
    };
  }
  
  // Log what was missing from primary
  const primaryMissing: string[] = [];
  if (!primaryBaseUrl) primaryMissing.push('JIRA_BASE_URL');
  if (!primaryEmail) primaryMissing.push('JIRA_USER_EMAIL');
  if (!primaryApiToken) primaryMissing.push('JIRA_API_TOKEN');
  
  errors.push(`Primary environment variables missing: ${primaryMissing.join(', ')}`);
  
  // Try MCP server config fallback
  const mcpBaseUrl = process.env.MCP_JIRA_BASE_URL;
  const mcpEmail = process.env.MCP_JIRA_USER_EMAIL;
  const mcpApiToken = process.env.MCP_JIRA_API_TOKEN;
  
  if (mcpBaseUrl && mcpEmail && mcpApiToken) {
    return {
      credentials: {
        baseUrl: mcpBaseUrl,
        email: mcpEmail,
        apiToken: mcpApiToken
      },
      source: {
        source: 'mcp_config',
        details: 'Retrieved from MCP server config environment variables (MCP_JIRA_BASE_URL, MCP_JIRA_USER_EMAIL, MCP_JIRA_API_TOKEN)'
      },
      errors
    };
  }
  
  // Log what was missing from MCP config
  const mcpMissing: string[] = [];
  if (!mcpBaseUrl) mcpMissing.push('MCP_JIRA_BASE_URL');
  if (!mcpEmail) mcpMissing.push('MCP_JIRA_USER_EMAIL');
  if (!mcpApiToken) mcpMissing.push('MCP_JIRA_API_TOKEN');
  
  errors.push(`MCP config environment variables missing: ${mcpMissing.join(', ')}`);
  
  // No valid credentials found
  return {
    source: {
      source: 'none',
      details: 'No valid JIRA credentials found in any source'
    },
    errors
  };
}

/**
 * Get JIRA credentials with enhanced error reporting
 * Throws with detailed information about what's missing and how to fix it
 */
export function getJiraCredentials(): JiraCredentials {
  const result = resolveJiraCredentials();
  
  if (result.credentials) {
    return result.credentials;
  }
  
  // Generate helpful error message
  let errorMessage = "Missing JIRA credentials. ";
  errorMessage += "Please set credentials using one of these methods:\n\n";
  
  errorMessage += "1. Primary Environment Variables:\n";
  errorMessage += "   - JIRA_BASE_URL\n";
  errorMessage += "   - JIRA_USER_EMAIL\n";
  errorMessage += "   - JIRA_API_TOKEN\n\n";
  
  errorMessage += "2. MCP Server Config (via mcp.json env section):\n";
  errorMessage += "   - MCP_JIRA_BASE_URL\n";
  errorMessage += "   - MCP_JIRA_USER_EMAIL\n";
  errorMessage += "   - MCP_JIRA_API_TOKEN\n\n";
  
  errorMessage += "Errors encountered:\n";
  result.errors.forEach((error, index) => {
    errorMessage += `${index + 1}. ${error}\n`;
  });
  
  errorMessage += "\nExample mcp.json configuration:\n";
  errorMessage += JSON.stringify({
    "name": "shrimp-task-manager",
    "command": "node",
    "args": ["dist/index.js"],
    "env": {
      "MCP_JIRA_BASE_URL": "https://your-company.atlassian.net",
      "MCP_JIRA_USER_EMAIL": "your-email@company.com", 
      "MCP_JIRA_API_TOKEN": "your-api-token-here"
    }
  }, null, 2);
  
  throw new Error(errorMessage);
}

/**
 * Get credential source information for debugging
 */
export function getCredentialSource(): CredentialSource {
  const result = resolveJiraCredentials();
  return result.source;
}

/**
 * Check if JIRA credentials are available without throwing
 */
export function hasJiraCredentials(): boolean {
  const result = resolveJiraCredentials();
  return !!result.credentials;
} 