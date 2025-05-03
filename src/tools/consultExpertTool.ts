import { z } from 'zod';
import { OpenAI } from 'openai';
import { logToFile } from '../utils/logUtils.js'; // Import logging utility
import { loadPromptFromTemplate } from '../prompts/loader.js'; // Corrected import path

// Define the input schema for the tool using Zod
export const ConsultExpertInputSchema = z.object({
  problem_description: z.string().describe('A clear description of the problem or question the agent is stuck on.'),
  relevant_context: z.string().describe('Relevant context like code snippets, error messages, previous steps, or task details.'),
  task_goal: z.string().optional().describe('The overall goal the agent is trying to achieve.'),
});

// Define the function to call the OpenAI API (uncommented)
async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // This error should now be less likely due to env var config
    await logToFile('[callOpenAI] ERROR: OPENAI_API_KEY environment variable is not set.'); 
    throw new Error('OPENAI_API_KEY environment variable is not set.');
  }

  await logToFile('[callOpenAI] Initializing OpenAI client...');
  const openai = new OpenAI({ apiKey });

  try {
    await logToFile(`[callOpenAI] Sending prompt to model (gpt-4o)...`);
    await logToFile(`[callOpenAI] Full Prompt:\n---\n${prompt}\n---`); 
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Or another preferred model
      messages: [{ role: 'user', content: prompt }],
    });
    const suggestion = response.choices[0]?.message?.content || 'No suggestion received from expert.';
    await logToFile(`[callOpenAI] Raw Suggestion Received:\n---\n${suggestion}\n---`); 
    await logToFile(`[callOpenAI] Received suggestion (length: ${suggestion.length})`);
    return suggestion;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await logToFile(`[callOpenAI] ERROR calling OpenAI API: ${message}`);
    console.error('Error calling OpenAI API:', error); // Keep console for potential visibility
    throw new Error(`Failed to get suggestion from expert: ${message}`);
  }
}

// Define and export the main tool execution function
export async function consultExpert(params: z.infer<typeof ConsultExpertInputSchema>): Promise<string> {
  await logToFile(`[consultExpert] Function started with params: ${JSON.stringify(params)}`);

  const { problem_description, relevant_context, task_goal } = params;

  // --- Load prompt components dynamically --- 
  let framingTemplate = "tools/consultExpert/framing_default.md";
  let instructionTemplate = "tools/consultExpert/instruction_default.md";
  const problemLower = problem_description.toLowerCase();

  // Determine template based on intent
  if (
    problemLower.startsWith('what') || 
    problemLower.startsWith('when') || 
    problemLower.startsWith('who') || 
    problemLower.startsWith('is ') || 
    problemLower.startsWith('are ') ||
    problemLower.startsWith('can you') || // Catching variations
    problemLower.includes(' date') || // Heuristic for date questions
    problemLower.includes(' time')
  ) {
    framingTemplate = "tools/consultExpert/framing_question.md";
    instructionTemplate = "tools/consultExpert/instruction_question.md";
  } 
  else if (
    problemLower.includes('how to') || 
    problemLower.includes('implement') || 
    problemLower.includes('create') || 
    problemLower.includes('write code')
  ) {
    framingTemplate = "tools/consultExpert/framing_howto.md";
    instructionTemplate = "tools/consultExpert/instruction_howto.md";
  }

  // Load the actual prompt text from templates
  const framing = loadPromptFromTemplate(framingTemplate);
  const instruction = loadPromptFromTemplate(instructionTemplate);
  // --- End Dynamic Prompt Construction ---

  // Construct the prompt using loaded components
  let prompt = `${framing}\n\nRequest/Problem: ${problem_description}\n\nRelevant Context:\n${relevant_context}`;

  if (task_goal) {
    prompt += `\n\nOverall Task Goal: ${task_goal}`;
  }

  prompt += `\n\n${instruction}`;
  

  await logToFile(`[consultExpert] Constructed prompt (length: ${prompt.length}). Calling callOpenAI...`);
  // Call the expert AI
  const suggestion = await callOpenAI(prompt);

  await logToFile(`[consultExpert] Received suggestion from callOpenAI. Formatting response.`);
  // Return the suggestion
  // Prefix changed slightly to be more general
  const finalResponse = `Expert Response:\n${suggestion}`; 
  await logToFile(`[consultExpert] Returning final response (length: ${finalResponse.length})`);
  return finalResponse;
} 