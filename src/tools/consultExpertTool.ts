import { z } from 'zod';
import OpenAI from 'openai';
import { getTaskById, updateTask } from '../models/taskModel.js'; // <-- Import task model functions
import { ExpertSuggestion, TaskStatus, Task } from '../types/index.js'; // <-- Import ExpertSuggestion type
import { loadPromptFromTemplate, generatePrompt } from '../prompts/loader.js'; // Corrected import path

// Define the input schema for the tool using Zod
export const ConsultExpertInputSchema = z.object({
  taskId: z.string().uuid({ message: "請提供有效的任務ID (UUID格式)" }).optional().describe("需要協助的任務ID (如果問題與特定任務相關)"),
  problem_description: z.string().describe('A clear description of the problem or question the agent is stuck on.'),
  relevant_context: z.string().describe('Relevant context like code snippets, error messages, previous steps, or task details.'),
  task_goal: z.string().optional().describe('The overall goal the agent is trying to achieve.'),
});

// Configuration for loop detection
const MAX_SIMILAR_CONSULTATIONS = 3;
const SIMILARITY_THRESHOLD = 0.9; // Jaro-Winkler similarity threshold

// Basic string similarity function (Jaro-Winkler) - could be more sophisticated
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  let m = 0;
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const range = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  for (let i = 0; i < s1.length; i++) {
    const low = Math.max(0, i - range);
    const high = Math.min(i + range + 1, s2.length);
    for (let j = low; j < high; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        m++;
        break;
      }
    }
  }

  if (m === 0) return 0.0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1Matches[i]) {
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) t++;
      k++;
    }
  }
  t /= 2;

  const jaro = (m / s1.length + m / s2.length + (m - t) / m) / 3;
  
  // Jaro-Winkler adjustment
  let p = 0.1; // Scaling factor
  let l = 0; // Length of common prefix
  const maxPrefixLength = 4;
  while(l < maxPrefixLength && s1[l] && s2[l] && s1[l] === s2[l]) {
    l++;
  }
  return jaro + l * p * (1 - jaro);
}

// Define the function to call the OpenAI API (uncommented)
async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set.');
  }

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview', // Use a model that supports JSON mode
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: "json_object" },
    });

    let rawContent = completion.choices[0]?.message?.content;

    if (rawContent) {
      try {
        // OpenAI should return a JSON string, parse it
        const parsedJson = JSON.parse(rawContent);
        // We expect a specific structure like { "advice": "..." }
        if (parsedJson && typeof parsedJson.advice === 'string') {
          return parsedJson.advice; // Return the core advice string
        } else {
          // The JSON is not in the expected format, return a clear error
          return JSON.stringify({ error: 'OpenAI returned JSON but not in the expected { "advice": "..." } format.', raw: rawContent });
        }
      } catch (e) {
        // If JSON.parse fails, OpenAI didn't adhere to response_format: { type: "json_object" }
        return JSON.stringify({ error: 'Failed to parse JSON response from OpenAI, though JSON was requested.', raw: rawContent });
      }
    } else {
      return JSON.stringify({ error: 'No suggestion received from expert.' });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get suggestion from expert: ${message}`);
  }
}

// Define and export the main tool execution function
export async function consultExpert(params: z.infer<typeof ConsultExpertInputSchema>): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    const { taskId, problem_description, relevant_context, task_goal } = params;

    // --- Loop Detection Logic ---
    if (taskId) {
      const task = await getTaskById(taskId);
      if (task && task.expertSuggestions && task.expertSuggestions.length >= MAX_SIMILAR_CONSULTATIONS) {
        const recentSuggestions = task.expertSuggestions.slice(-MAX_SIMILAR_CONSULTATIONS);
        let similarConsultationCount = 0;
        
        for (const suggestion of recentSuggestions) {
          // Check if problemDescription and relevantContext exist before calculating similarity
          if (suggestion.problemDescription && suggestion.relevantContext) {
            const problemSimilarity = calculateSimilarity(problem_description, suggestion.problemDescription);
            const contextSimilarity = calculateSimilarity(relevant_context, suggestion.relevantContext);
            // Consider it a similar consultation if both are highly similar
            if (problemSimilarity >= SIMILARITY_THRESHOLD && contextSimilarity >= SIMILARITY_THRESHOLD) {
              similarConsultationCount++;
            }
          }
        }

        if (similarConsultationCount >= MAX_SIMILAR_CONSULTATIONS) {
          const loopDetectedMessage = `## ⚠️ Potential Loop Detected\n\nIt appears we have consulted the expert multiple times (${similarConsultationCount} times) with very similar questions for task ${taskId} without a clear resolution. \n\n**Suggestion:**\n- Please re-evaluate the current approach or the information being provided to the expert.\n- Consider if the core problem needs to be broken down differently or if a different strategy is required.\n- You might be stuck in a loop. Try to change your plan significantly before consulting again on this specific issue.\n\n(The original expert advice for this instance will still be provided below if successful, but please heed this warning.)`;
          
          // Proceed to get advice, but prepend the warning
          const expertAdvice = await getOpenAIAdvice(problem_description, relevant_context, task_goal);
          
          // Persist this new advice (even with the loop warning)
          await persistAdvice(taskId, expertAdvice, problem_description, relevant_context, task);
          
          return {
            content: [
              { type: "text" as const, text: `${loopDetectedMessage}\n\n--- Original Expert Advice ---\n${expertAdvice}` },
            ],
          };
        }
      }
    }
    // --- End Loop Detection Logic ---

    const expertAdvice = await getOpenAIAdvice(problem_description, relevant_context, task_goal);
    
    if (taskId) {
      const task = await getTaskById(taskId); // Re-fetch task in case it was not fetched for loop detection
      await persistAdvice(taskId, expertAdvice, problem_description, relevant_context, task);
    } else {
      console.log(`Received advice from callOpenAI. No taskId provided, skipping persistence.`);
    }

    const finalResponse = `## Expert Consultation Result\n\n${expertAdvice}`;
    return {
      content: [
        { type: "text" as const, text: finalResponse },
      ],
    };
  } catch (error: unknown) {
    console.error('Error in consultExpert tool:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while consulting the expert.';
    return {
      content: [
        { type: "text" as const, text: `Error during expert consultation: ${errorMessage}` },
      ],
    };
  }
}

// Helper function to get OpenAI advice to avoid code duplication
async function getOpenAIAdvice(problem_description: string, relevant_context: string, task_goal?: string): Promise<string> {
  // --- Load prompt components dynamically --- 
  let framingTemplate = "tools/consultExpert/framing_default.md";
  let instructionTemplate = "tools/consultExpert/instruction_default.md";
  const problemLower = problem_description.toLowerCase();

  if (
    problemLower.startsWith('what') || 
    problemLower.startsWith('when') || 
    problemLower.startsWith('who') || 
    problemLower.startsWith('is ') || 
    problemLower.startsWith('are ') ||
    problemLower.startsWith('can you') || 
    problemLower.includes(' date') || 
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

  const framing = loadPromptFromTemplate(framingTemplate);
  const instruction = loadPromptFromTemplate(instructionTemplate);
  
  let prompt = `${framing}\n\nRequest/Problem: ${problem_description}\n\nRelevant Context:\n${relevant_context}`;
  if (task_goal) {
    prompt += `\n\nOverall Task Goal: ${task_goal}`;
  }
  prompt += `\n\n${instruction}\n\nRespond ONLY in JSON format as { \"advice\": \"...\" } and nothing else. (This is required for correct parsing. Output must be valid JSON.)`;
  
  return await callOpenAI(prompt);
}

// Helper function to persist advice
async function persistAdvice(taskId: string, advice: string, problemDescription: string, relevantContext: string, task: Task | null) {
  if (task) {
    try {
      const newSuggestion: ExpertSuggestion = {
        timestamp: new Date(),
        advice: advice,
        problemDescription: problemDescription, // Save the problem description
        relevantContext: relevantContext     // Save the relevant context
      };
      const existingSuggestions = task.expertSuggestions || [];
      const updatedSuggestions = [...existingSuggestions, newSuggestion];
      await updateTask(taskId, { expertSuggestions: updatedSuggestions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error persisting expert advice for task ${taskId}:`, message);
      // Optionally, re-throw or handle more gracefully if persistence is critical
    }
  } else {
    console.warn(`Warning: Task ${taskId} not found (or not passed to persistAdvice). Could not persist advice.`);
  }
} 