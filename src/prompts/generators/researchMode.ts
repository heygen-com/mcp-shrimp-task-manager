import { z } from "zod";

export const researchModeSchema = z.object({
  summary: z.string().min(10, {
    message: "研究摘要不能少於10個字符，請提供更詳細的描述以確保研究目標明確",
  }).describe("結構化的研究摘要，包含研究目標、範圍與關鍵技術挑戰，最少10個字符"),
  previousState: z.string().optional().describe("前次研究狀態，用於持續改進方案（僅在重新研究時需提供）"),
});

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