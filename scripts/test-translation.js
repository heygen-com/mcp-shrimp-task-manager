#!/usr/bin/env node

/**
 * Test script for the translation tool
 * This demonstrates various features of the translate_content tool
 * 
 * To run: node scripts/test-translation.js
 */

import 'dotenv/config';

// Example payloads for different translation scenarios
const examples = {
  // Basic translation with domain context
  financial_credit: {
    tool: "translate_content",
    arguments: {
      content: "Your credit card will be charged $50",
      targetLanguage: "zh-TW",
      domain: "finance"
    }
  },

  // Educational context
  educational_credit: {
    tool: "translate_content", 
    arguments: {
      content: "You need 120 credits to graduate",
      targetLanguage: "zh-TW",
      context: "University degree requirements",
      domain: "education"
    }
  },

  // Ambiguous term with clarification request
  ambiguous_application: {
    tool: "translate_content",
    arguments: {
      content: "The application was rejected",
      targetLanguage: "es",
      requestClarification: true
    }
  },

  // Technical documentation
  api_docs: {
    tool: "translate_content",
    arguments: {
      content: "POST /api/users - Creates a new user account",
      targetLanguage: "ja",
      domain: "technical",
      context: "REST API documentation"
    }
  },

  // UI element
  button_text: {
    tool: "translate_content",
    arguments: {
      content: "Submit",
      targetLanguage: "fr",
      domain: "ui",
      context: "Form submission button"
    }
  },

  // Error message
  error_message: {
    tool: "translate_content",
    arguments: {
      content: "Error: Invalid email format",
      targetLanguage: "de",
      domain: "error_messages"
    }
  }
};

console.log("Translation Tool Test Examples");
console.log("==============================\n");

console.log("These examples demonstrate how to use the translate_content tool:");
console.log("\n1. Financial Context - Credit Card:");
console.log(JSON.stringify(examples.financial_credit, null, 2));

console.log("\n2. Educational Context - University Credits:");
console.log(JSON.stringify(examples.educational_credit, null, 2));

console.log("\n3. Ambiguous Term with Clarification:");
console.log(JSON.stringify(examples.ambiguous_application, null, 2));

console.log("\n4. Technical Documentation:");
console.log(JSON.stringify(examples.api_docs, null, 2));

console.log("\n5. UI Element:");
console.log(JSON.stringify(examples.button_text, null, 2));

console.log("\n6. Error Message:");
console.log(JSON.stringify(examples.error_message, null, 2));

console.log("\n\nNotes:");
console.log("- The tool requires OPENAI_API_KEY to be set in your environment");
console.log("- Translation memory is stored in DATA_DIR/translation_memory/");
console.log("- Each translation improves the system's knowledge for future translations");
console.log("- Use requestClarification: true when context might be ambiguous");
console.log("\nSee docs/translation-tool-guide.md for complete documentation"); 