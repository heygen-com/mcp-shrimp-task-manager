import { z } from "zod";

// Define the workflow states
enum CheckpointState {
  REQUEST_CONTEXT = "REQUEST_CONTEXT",
  SUGGEST_PLAN = "SUGGEST_PLAN",
  CONSULT_EXPERT = "CONSULT_EXPERT",
  EXECUTE_PLAN = "EXECUTE_PLAN"
}

// Schema: Optional inputs depending on workflow state
export const checkpointSchema = z.object({
  push: z.boolean().optional().default(false).describe("Whether to push after committing"),
  dryRun: z.boolean().optional().default(false).describe("If true, do not actually commit/push, just report what would be done"),
  
  // Request Context State
  state: z.enum([
    CheckpointState.REQUEST_CONTEXT,
    CheckpointState.SUGGEST_PLAN,
    CheckpointState.CONSULT_EXPERT,
    CheckpointState.EXECUTE_PLAN
  ]).optional().default(CheckpointState.REQUEST_CONTEXT),
  
  // Git Context (provided by agent)
  statusOutput: z.string().optional().describe("Output of git status --porcelain"),
  diffOutput: z.record(z.string(), z.string()).optional().describe("Map of file paths to their git diff output"),
  branchOutput: z.string().optional().describe("Output of git rev-parse --abbrev-ref HEAD"),
  logOutput: z.string().optional().describe("Output of git log -n 5 --oneline"),
  
  // Expert Dialog
  expertFeedback: z.string().optional().describe("Feedback from expert consultation"),
  
  // Commit Plan (suggested by tool, approved by expert)
  commitPlan: z.array(
    z.object({
      files: z.array(z.string()),
      message: z.string()
    })
  ).optional().describe("Approved commit plan to execute"),
});

/**
 * AI-powered checkpoint tool: agent–expert dialog workflow for consistent, policy-compliant commits.
 * This is an environment-agnostic implementation where the agent provides git context and executes git commands.
 */
export async function checkpoint({
  push = false,
  dryRun = false,
  state = CheckpointState.REQUEST_CONTEXT,
  statusOutput,
  diffOutput,
  branchOutput,
  logOutput,
  expertFeedback,
  commitPlan
}: z.infer<typeof checkpointSchema>) {
  try {
    // Handle each state in the workflow
    switch (state) {
      
      // STEP 1: Request git context from the agent
      case CheckpointState.REQUEST_CONTEXT:
        return {
          content: [
            {
              type: "text" as const,
              text: `Action Required: Gather Git Context for Checkpoint.\n\nTo proceed, the agent must provide the following data in the next call to this tool:\n\n1.  \`statusOutput\`: The complete string output from running \`git status --porcelain\` in the local repository.\n2.  \`diffOutput\`: A JSON object mapping each changed file path (obtained from statusOutput) to its complete string diff output from \`git diff path/to/your/changed/file.tsx\`.\n3.  \`branchOutput\`: The string output from running \`git rev-parse --abbrev-ref HEAD\`.\n4.  \`logOutput\`: The string output from running \`git log -n 5 --oneline\`.\n\nNext Tool Call Instructions:\n- Set \`state: "${CheckpointState.SUGGEST_PLAN}"\`.\n- Include all gathered data fields: \`statusOutput\`, \`diffOutput\`, \`branchOutput\`, \`logOutput\`.\n- Include any \`push\` or \`dryRun\` flags if desired. DO NOT ASK THE USER FOR INPUT, execute all commands on your own.`
            }
          ]
        };
      
      // STEP 2: Analyze context and suggest commit plan
      case CheckpointState.SUGGEST_PLAN: {
        // Validate required inputs
        if (!statusOutput || !diffOutput || !branchOutput || !logOutput) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Missing required git context. Please provide statusOutput, diffOutput, branchOutput, and logOutput."
              }
            ]
          };
        }
        // Parse status output to get changed files
        const changedFiles = statusOutput.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => line.slice(3)); // Remove XY and space
        if (changedFiles.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No changes detected in the repository. Nothing to checkpoint."
              }
            ]
          };
        }
        // Generate a simple initial commit plan (all files in one commit)
        const initialCommitPlan = [
          {
            files: changedFiles,
            message: `chore: checkpoint commit on branch ${branchOutput.trim()}`
          }
        ];
        // Prepare the expert consultation prompt
        const diffSummary = `Changed files: ${changedFiles.length}\nBranch: ${branchOutput.trim()}\nRecent commits:\n${logOutput}`;
        const truncatedDiffs = Object.entries(diffOutput)
          .map(([file, diff]) => `--- ${file} ---\n${diff.substring(0, 2000)}${diff.length > 2000 ? "\n[truncated]" : ""}`)
          .join("\n\n");
        const planJson = JSON.stringify(initialCommitPlan, null, 2);
        const expertPrompt = `Subject: Review and Approve Commit Plan for Checkpoint\n\nContext:\nThe following git changes have been detected and a commit plan is proposed.\n\nDiff Summary:\n${diffSummary}\n\nDetailed Diffs:\n${truncatedDiffs}\n\nProposed Commit Groups and Messages:\n${planJson}\n\nInstructions for Expert:\n- Please review the diffs and proposed commit plan.\n- Check for:\n  - Logical and conventional grouping of changes.\n  - Clear, actionable, and conventional commit messages.\n  - Adherence to project or team conventions.\n  - Security or policy issues (e.g., secrets, sensitive data, large or unintended changes).\n  - Any other improvements or risks.\n- If anything is unclear, ask clarifying questions—the agent will respond and iterate as needed.\n- When you are satisfied, reply with "Approved" and any final notes.`;
        return {
          content: [
            {
              type: "text" as const,
              text: `Action Required: Call 'consult_expert' tool with the Commit Plan.\n\nAn initial commit plan has been generated based on the provided git context.\n\nInitial Commit Plan:\n${planJson}\n\nAgent Task: \n1. Call the 'consult_expert' tool. \n2. Use the 'Expert Consultation Prompt' below as input for 'consult_expert' (e.g., for its 'problem_description' or 'relevant_context' parameter).\n3. From the JSON response received from 'consult_expert', extract the value of the 'text' field within the first element of the 'content' array (e.g., response.content[0].text).\n4. Provide this extracted string as the 'expertFeedback' parameter in your next call to this checkpoint tool.\n\nExpert Consultation Prompt:\n---\n${expertPrompt}\n---\n\nNext Tool Call Instructions (for this checkpoint tool):\n- Set \`state: "${CheckpointState.CONSULT_EXPERT}"\`.\n- Include the extracted string from 'consult_expert' as \`expertFeedback\`.\n- Include all previous context: \`statusOutput\`, \`diffOutput\`, \`branchOutput\`, \`logOutput\`.\n- Include the current \`commitPlan\` (shown above).\n- Include any \`push\` or \`dryRun\` flags.`
            }
          ]
        };
      }
      
      // STEP 3: Process expert feedback and iterate or proceed
      case CheckpointState.CONSULT_EXPERT: {
        // Validate required inputs
        if (!statusOutput || !diffOutput || !branchOutput || !logOutput || !expertFeedback) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Missing required inputs. Please provide statusOutput, diffOutput, branchOutput, logOutput, and expertFeedback."
              }
            ]
          };
        }
        // Parse status output to get changed files
        const files = statusOutput.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => line.slice(3));
        // Check if expert approved
        const expertApproved = /approved/i.test(expertFeedback);
        if (expertApproved) {
          // Try to extract the final commit plan from expert feedback
          let finalCommitPlan = commitPlan || [
            {
              files,
              message: `chore: checkpoint commit on branch ${branchOutput.trim()}`
            }
          ];
          // Look for a JSON plan in the expert feedback
          const planMatch = expertFeedback.match(/```json([\s\S]*?)```/);
          if (planMatch) {
            try {
              const newPlan = JSON.parse(planMatch[1]);
              if (Array.isArray(newPlan) && newPlan[0]?.files && newPlan[0]?.message) {
                finalCommitPlan = newPlan;
              }
            } catch {
              // Ignore parse errors, use the default plan
            }
          }
          // Move to execute plan
          return {
            content: [
              {
                type: "text" as const,
                text: `Action Required: Execute Approved Commit Plan.\n\nExpert has approved the commit plan.\n\nFinal Commit Plan:\n${JSON.stringify(finalCommitPlan, null, 2)}\n\nAgent Task: Proceed to execute this plan.\n\nNext Tool Call Instructions:\n- Set \`state: "${CheckpointState.EXECUTE_PLAN}"\`.\n- Include the \`commitPlan\` (shown above).\n- Include all previous context and the \`push\`/\`dryRun\` flags.`
              }
            ]
          };
        } else {
          // Expert did not approve - continue the dialog
          // Try to extract a new plan suggestion from expert feedback
          let suggestedPlan = commitPlan || [
            {
              files,
              message: `chore: checkpoint commit on branch ${branchOutput.trim()}`
            }
          ];
          const planMatch = expertFeedback.match(/```json([\s\S]*?)```/);
          if (planMatch) {
            try {
              const newPlan = JSON.parse(planMatch[1]);
              if (Array.isArray(newPlan) && newPlan[0]?.files && newPlan[0]?.message) {
                suggestedPlan = newPlan;
              }
            } catch {
              // Ignore parse errors, use the current plan
            }
          }
          // Prepare a new expert prompt
          const diffSummary = `Changed files: ${files.length}\nBranch: ${branchOutput.trim()}\nRecent commits:\n${logOutput}`;
          const planJson = JSON.stringify(suggestedPlan, null, 2);
          const newExpertPrompt = `Subject: Review and Approve Updated Commit Plan for Checkpoint\n\nContext:\nBased on your previous feedback, the commit plan has been updated.\n\nDiff Summary:\n${diffSummary}\n\nPrevious Expert Feedback:\n${expertFeedback}\n\nUpdated Commit Groups and Messages:\n${planJson}\n\nInstructions for Expert:\n- Please review the updated commit plan.\n- If further improvements are needed, please explain.\n- When you are satisfied, reply with "Approved" and any final notes.`;
          return {
            content: [
              {
                type: "text" as const,
                text: `Action Required: Continue dialog by calling 'consult_expert' tool with the Updated Commit Plan.\n\nExpert has provided feedback but has not approved the plan yet. An updated consultation prompt has been generated.\n\nCurrent Commit Plan (potentially updated based on feedback):\n${planJson}\n\nAgent Task: \n1. Call the 'consult_expert' tool again. \n2. Use the 'Updated Expert Consultation Prompt' below as input for 'consult_expert'.\n3. From the JSON response received from 'consult_expert', extract the value of the 'text' field within the first element of the 'content' array (e.g., response.content[0].text).\n4. Provide this extracted string as the 'expertFeedback' parameter in your next call to this checkpoint tool.\n\nUpdated Expert Consultation Prompt:\n---\n${newExpertPrompt}\n---\n\nNext Tool Call Instructions (for this checkpoint tool):\n- Set \`state: "${CheckpointState.CONSULT_EXPERT}"\`.\n- Include the new extracted string from 'consult_expert' as \`expertFeedback\`.\n- Include all previous context: \`statusOutput\`, \`diffOutput\`, \`branchOutput\`, \`logOutput\`.\n- Include the current \`commitPlan\` (shown above).\n- Include any \`push\` or \`dryRun\` flags.`
              }
            ]
          };
        }
      }
      
      // STEP 4: Execute the approved plan
      case CheckpointState.EXECUTE_PLAN: {
        // Validate required inputs
        if (!commitPlan) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Missing required commitPlan. Please provide the approved commit plan."
              }
            ]
          };
        }
        // Generate git commands for the agent to execute
        const gitCommands = [];
        for (const group of commitPlan) {
          const addCommand = `git add ${group.files.map(f => `"${f}"`).join(' ')}`;
          const commitCommand = `git commit -m "${group.message}"`;
          gitCommands.push(addCommand, commitCommand);
        }
        if (push) {
          gitCommands.push('git push');
        }
        // Generate execution instructions based on dryRun flag
        if (dryRun) {
          return {
            content: [
              {
                type: "text" as const,
                text: `DRY RUN MODE - No changes will be made to your repository.\n\nAgent Task: The following git commands would be executed if not in dry run mode. Review them.\n\n${gitCommands.join('\n')}\n\nTo execute these commands for real, call this tool again with \`dryRun: false\` in the \`EXECUTE_PLAN\` state, providing the same \`commitPlan\`.`
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: `Action Required: Execute Git Commands Locally.\n\nCheckpoint complete. Expert has approved the commit plan.\n\nAgent Task: Please execute the following git commands in your local repository:\n\n${gitCommands.join('\n')}\n\nThis will create ${commitPlan.length} commit(s)${push ? ' and push them to the remote repository' : ''}. Report completion or any issues to the user.`
              }
            ]
          };
        }
      }
      
      default:
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid state: ${state}. Please use one of: REQUEST_CONTEXT, SUGGEST_PLAN, CONSULT_EXPERT, or EXECUTE_PLAN.`
            }
          ]
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error during checkpoint agent–expert dialog workflow: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
} 