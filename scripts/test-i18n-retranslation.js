#!/usr/bin/env node

/**
 * Test examples for the i18n retranslation tool
 * Demonstrates various usage scenarios
 * 
 * To run: node scripts/test-i18n-retranslation.js
 */

import 'dotenv/config';

console.log("i18n Retranslation Tool - Usage Examples");
console.log("=========================================\n");

console.log("Note: These are example payloads. The tool requires:");
console.log("- OPENAI_API_KEY environment variable");
console.log("- Valid project path with i18n structure");
console.log("- English source files in locales/en-US/\n");

// Example 1: Basic namespace translation
console.log("1. Basic Translation (Auth namespace):");
console.log("--------------------------------------");
console.log(JSON.stringify({
  tool: "retranslate_i18n",
  arguments: {
    projectPath: "/Users/co/dev/heygen/pacific",
    namespace: "Auth"
  }
}, null, 2));

// Example 2: Dry run mode
console.log("\n\n2. Dry Run Mode (preview changes):");
console.log("-----------------------------------");
console.log(JSON.stringify({
  tool: "retranslate_i18n",
  arguments: {
    projectPath: "/Users/co/dev/heygen/pacific",
    namespace: "Home",
    dryRun: true
  }
}, null, 2));

// Example 3: Force retranslate all
console.log("\n\n3. Retranslate All Keys (override existing):");
console.log("---------------------------------------------");
console.log(JSON.stringify({
  tool: "retranslate_i18n",
  arguments: {
    projectPath: "/Users/co/dev/heygen/pacific",
    namespace: "Welcome",
    preserveExisting: false
  }
}, null, 2));

// Example 4: Specific languages only
console.log("\n\n4. Translate to Specific Languages:");
console.log("------------------------------------");
console.log(JSON.stringify({
  tool: "retranslate_i18n",
  arguments: {
    projectPath: "/Users/co/dev/heygen/pacific",
    namespace: "Settings",
    targetLanguages: ["pt-BR", "es-MS"]
  }
}, null, 2));

// Example 5: Custom domain context
console.log("\n\n5. Custom Domain Context:");
console.log("-------------------------");
console.log(JSON.stringify({
  tool: "retranslate_i18n",
  arguments: {
    projectPath: "/Users/co/dev/heygen/pacific",
    namespace: "Billing",
    domain: "finance"
  }
}, null, 2));

// Example 6: Batch processing script
console.log("\n\n6. Batch Processing (JavaScript):");
console.log("---------------------------------");
console.log(`
// batch-retranslate.js
const namespaces = ['Auth', 'Home', 'Welcome', 'Settings', 'Billing'];

async function retranslateAll() {
  for (const namespace of namespaces) {
    console.log(\`Translating \${namespace}...\`);
    
    // First do a dry run
    await retranslate_i18n({
      projectPath: "/Users/co/dev/heygen/pacific",
      namespace: namespace,
      dryRun: true
    });
    
    // Then apply if satisfied
    await retranslate_i18n({
      projectPath: "/Users/co/dev/heygen/pacific",
      namespace: namespace
    });
  }
}
`);

// Example JSON structure
console.log("\n\n7. Example JSON Structure:");
console.log("--------------------------");
console.log(`
// en-US/Auth.json
{
  "login_title": "Sign In to HeyGen",
  "login_subtitle": "Welcome back!",
  "email_label": "Email",
  "password_label": "Password",
  "login_button": "Log In",
  "signup_link": "Don't have an account? Sign up",
  "forgot_password": "Forgot Password?",
  "error_invalid_credentials": "Invalid email or password",
  "error_network": "Network error. Please try again.",
  "success_login": "Welcome back, {{name}}!",
  "oauth_google": "Continue with Google",
  "oauth_apple": "Continue with Apple",
  "sso_login": "SSO Login"
}
`);

console.log("\n\nProtected Terms:");
console.log("----------------");
console.log("The following terms will NOT be translated:");
console.log("- Company names: HeyGen, Apple, Google, Microsoft");
console.log("- Auth methods: SSO, OAuth");
console.log("- Technical: API, URL, UUID, JSON");
console.log("- Variables: {{name}}, {{count}}, etc.");

console.log("\n\nWorkflow Tips:");
console.log("--------------");
console.log("1. Always run dry-run first to preview changes");
console.log("2. Review sample translations in the output");
console.log("3. Use preserveExisting=true to only add missing keys");
console.log("4. Commit your changes after verification");
console.log("5. Translation memory improves over time");

console.log("\n\nFor detailed documentation, see:");
console.log("docs/i18n-retranslation-guide.md"); 