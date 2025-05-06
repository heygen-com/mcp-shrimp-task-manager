import { z } from 'zod';
import OpenAI from 'openai';
import { getTaskById, updateTask } from '../models/taskModel.js'; // <-- Import task model functions
import { ExpertSuggestion, TaskStatus } from '../types/index.js'; // <-- Import ExpertSuggestion type
import { loadPromptFromTemplate, generatePrompt } from '../prompts/loader.js'; // Corrected import path

// Define the input schema for the tool using Zod
export const ConsultExpertInputSchema = z.object({
  taskId: z.string().uuid({ message: "請提供有效的任務ID (UUID格式)" }).optional().describe("需要協助的任務ID (如果問題與特定任務相關)"),
  problem_description: z.string().describe('A clear description of the problem or question the agent is stuck on.'),
  relevant_context: z.string().describe('Relevant context like code snippets, error messages, previous steps, or task details.'),
  task_goal: z.string().optional().describe('The overall goal the agent is trying to achieve.'),
});

// Define the function to call the OpenAI API (uncommented)
async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // This error should now be less likely due to env var config
    throw new Error('OPENAI_API_KEY environment variable is not set.');
  }

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Or another preferred model
      messages: [{ role: 'user', content: prompt }],
    });
    const suggestion = completion.choices[0]?.message?.content || 'No suggestion received from expert.';
    return suggestion;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error calling OpenAI API:', error); // Keep console for potential visibility
    throw new Error(`Failed to get suggestion from expert: ${message}`);
  }
}

// Define and export the main tool execution function
export async function consultExpert(params: z.infer<typeof ConsultExpertInputSchema>): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    const { taskId, problem_description, relevant_context, task_goal } = params;

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
    
    // Call the expert AI
    const expertAdvice = await callOpenAI(prompt);

    // *** Persist advice to task only if taskId is provided ***
    if (taskId) {
      try {
        const task = await getTaskById(taskId);
        if (task) {
          const newSuggestion: ExpertSuggestion = {
            timestamp: new Date(),
            advice: expertAdvice // Store the raw advice
          };
          const existingSuggestions = task.expertSuggestions || [];
          const updatedSuggestions = [...existingSuggestions, newSuggestion];
          await updateTask(taskId, { expertSuggestions: updatedSuggestions });
        } else {
          console.warn(`Warning: Task ${taskId} not found. Could not persist advice.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error persisting expert advice for task ${taskId}:`, message);
      }
    } else {
      console.log(`Received advice from callOpenAI. No taskId provided, skipping persistence.`);
    }
    // *** End Persist advice ***

    // Return the suggestion
    // Prefix changed slightly to be more general - corrected backslash
    const finalResponse = `## Expert Consultation Result\n\n${expertAdvice}`;
    return {
      content: [
        {
          type: "text" as const,
          text: finalResponse,
        },
      ],
    };
  } catch (error: unknown) {
    console.error('Error in consultExpert tool:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while consulting the expert.';
    // Ensure the return type is still satisfied even in case of error
    return {
      content: [
        {
          type: "text" as const,
          text: `Error during expert consultation: ${errorMessage}`,
        },
      ],
    };
  }
} 