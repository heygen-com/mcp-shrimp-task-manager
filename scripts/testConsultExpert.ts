import dotenv from 'dotenv';
import { consultExpert, ConsultExpertInputSchema } from '../src/tools/consultExpertTool.js';

// Load environment variables from .env file
dotenv.config();

async function runTest() {
  console.log('Testing consultExpert tool...');

  // --- Define Test Input ---
  const testInput = {
    problem_description: "What are the common ways to handle asynchronous operations in JavaScript?",
    relevant_context: "Just need a general overview of standard techniques like callbacks, Promises, and async/await.",
    // task_goal: "Understand async JS patterns" // Optional
  };

  try {
    // Validate input (optional but good practice)
    const validatedInput = ConsultExpertInputSchema.parse(testInput);
    console.log('\n--- Input ---');
    console.log(JSON.stringify(validatedInput, null, 2));

    // --- Call the function ---
    console.log('\nCalling OpenAI API via consultExpert...');
    const result = await consultExpert(validatedInput);

    // --- Print the result ---
    console.log('\n--- Result ---');
    console.log(result);

  } catch (error) {
    console.error('\n--- Error ---');
    if (error instanceof Error) {
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Stack Trace:', error.stack);
    } else {
      console.error('Caught an unknown error:', error);
    }
    process.exitCode = 1; // Indicate failure
  }
}

runTest(); 