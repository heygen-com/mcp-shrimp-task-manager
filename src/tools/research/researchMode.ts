import { z } from "zod";
import { researchModeSchema } from "../../prompts/generators/researchMode.js";

export { researchModeSchema };

export async function researchMode({
  summary,
  previousState,
}: z.infer<typeof researchModeSchema>) {
  // This would use a prompt template in a real implementation
  return {
    content: [
      {
        type: "text" as const,
        text: `# Research Mode\n\nSummary: ${summary}\n\n${previousState ? `Previous State: ${previousState}` : ""}`,
      },
    ],
  };
} 