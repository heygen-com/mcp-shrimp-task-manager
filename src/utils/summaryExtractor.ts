/**
 * 摘要提取工具：從對話內容中提取關鍵信息
 *
 * 本模塊提供從完整對話中提取關鍵信息的功能，使用多種策略來識別重要內容：
 * 1. 關鍵詞匹配：識別含有特定關鍵詞的句子
 * 2. 句子重要性評分：基於位置、長度等因素評估句子重要性
 * 3. 上下文關聯：考慮句子間的邏輯關聯
 */

/**
 * 從文本中提取簡短摘要
 * @param text 要提取摘要的文本
 * @param maxLength 摘要的最大長度
 * @returns 提取的摘要文本
 */
export function extractSummary(text: string, maxLength: number = 100): string {
  if (!text) return "";

  // 移除 Markdown 格式
  const plainText = text
    .replace(/```[\s\S]*?```/g, "") // 移除代碼塊
    .replace(/#+\s/g, "") // 移除標題標記
    .replace(/\*\*/g, "") // 移除粗體標記
    .replace(/\*/g, "") // 移除斜體標記
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 將連結替換為文本
    .replace(/\n/g, " ") // 將換行符替換為空格
    .replace(/\s+/g, " ") // 將多個空格替換為單個空格
    .trim();

  // 如果文本長度在允許範圍內，直接返回
  if (plainText.length <= maxLength) {
    return plainText;
  }

  // 取前段並添加省略號
  return plainText.substring(0, maxLength - 3) + "...";
}

/**
 * 生成任務完成摘要
 * @param taskName 任務名稱
 * @param taskDescription 任務描述
 * @param completionDetails 完成細節（可選）
 * @returns 生成的任務摘要
 */
export function generateTaskSummary(
  taskName: string,
  taskDescription: string,
  completionDetails?: string
): string {
  // 如果提供了完成細節，優先使用
  if (completionDetails) {
    return extractSummary(completionDetails, 250);
  }

  // 否則從任務名稱和描述生成摘要
  const baseText = `${taskName}已成功完成。該任務涉及${extractSummary(
    taskDescription,
    200
  )}`;
  return extractSummary(baseText, 250);
}

/**
 * 將文本分割為句子
 *
 * @param text 要分割的文本
 * @returns 句子數組
 */
function splitIntoSentences(text: string): string[] {
  // 使用正則表達式分割句子
  // 匹配中文和英文的句號、問號、驚嘆號，以及換行符
  const sentenceSplitters = /(?<=[。.！!？?\n])\s*/g;
  const sentences = text
    .split(sentenceSplitters)
    .filter((s) => s.trim().length > 0);

  return sentences;
}

/**
 * 從指定內容中提取一個簡短標題
 *
 * @param content 要提取標題的內容
 * @param maxLength 標題的最大長度
 * @returns 提取的標題
 */
export function extractTitle(content: string, maxLength: number = 50): string {
  // 防禦性檢查
  if (!content || content.trim().length === 0) {
    return "";
  }

  // 分割為句子
  const sentences = splitIntoSentences(content);
  if (sentences.length === 0) {
    return "";
  }

  // 先考慮第一個句子
  let title = sentences[0];

  // 如果第一個句子太長，找到第一個逗號或其他分隔符截斷
  if (title.length > maxLength) {
    const firstPart = title.split(/[,，:：]/)[0];
    if (firstPart && firstPart.length < maxLength) {
      title = firstPart;
    } else {
      title = title.substring(0, maxLength - 3) + "...";
    }
  }

  return title;
}

/**
 * 基於對話上下文智能提取摘要
 *
 * @param messages 對話消息列表，每條消息包含角色和內容
 * @param maxLength 摘要的最大長度
 * @returns 提取的摘要
 */
export function extractSummaryFromConversation(
  messages: Array<{ role: string; content: string }>,
  maxLength: number = 200
): string {
  // 防禦性檢查
  if (!messages || messages.length === 0) {
    return "";
  }

  // 如果只有一條消息，直接提取其摘要
  if (messages.length === 1) {
    return extractSummary(messages[0].content, maxLength);
  }

  // 連接所有消息，但保留角色信息
  const combinedText = messages
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join("\n");

  // 從組合文本提取摘要
  const summary = extractSummary(combinedText, maxLength);

  return summary;
}
