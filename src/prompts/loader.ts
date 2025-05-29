/**
 * prompt 載入器
 * 提供從環境變數載入自定義 prompt 的功能
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function processEnvString(input: string | undefined): string {
  if (!input) return "";

  return input
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r");
}

/**
 * 載入 prompt，支援環境變數自定義
 * @param basePrompt 基本 prompt 內容
 * @param promptKey prompt 的鍵名，用於生成環境變數名稱
 * @returns 最終的 prompt 內容
 */
export function loadPrompt(basePrompt: string, promptKey: string): string {
  // 轉換為大寫，作為環境變數的一部分
  const envKey = promptKey.toUpperCase();

  // 檢查是否有替換模式的環境變數
  const overrideEnvVar = `MCP_PROMPT_${envKey}`;
  if (process.env[overrideEnvVar]) {
    // 使用環境變數完全替換原始 prompt
    return processEnvString(process.env[overrideEnvVar]);
  }

  // 檢查是否有追加模式的環境變數
  const appendEnvVar = `MCP_PROMPT_${envKey}_APPEND`;
  if (process.env[appendEnvVar]) {
    // 將環境變數內容追加到原始 prompt 後
    return `${basePrompt}\n\n${processEnvString(process.env[appendEnvVar])}`;
  }

  // 如果沒有自定義，則使用原始 prompt
  return basePrompt;
}

/**
 * 生成包含動態參數的 prompt
 * @param promptTemplate prompt 模板
 * @param params 動態參數
 * @returns 填充參數後的 prompt
 */
export function generatePrompt(
  promptTemplate: string,
  params: Record<string, unknown> = {}
): string {
  // 使用簡單的模板替換方法，將 {paramName} 替換為對應的參數值
  let result = promptTemplate;

  Object.entries(params).forEach(([key, value]) => {
    // 如果值為 undefined 或 null，使用空字串替換
    const replacementValue =
      value !== undefined && value !== null ? String(value) : "";

    // 使用正則表達式替換所有匹配的佔位符
    const placeholder = new RegExp(`\\{${key}\\}`, "g");
    result = result.replace(placeholder, replacementValue);
  });

  return result;
}

/**
 * 從模板載入 prompt
 * @param templatePath 相對於模板集根目錄的模板路徑 (e.g., 'chat/basic.md')
 * @returns 模板內容
 * @throws Error 如果找不到模板文件
 */
export function loadPromptFromTemplate(templatePath: string): string {
  const templateSetName = process.env.TEMPLATES_USE || "en";
  const dataDir = process.env.DATA_DIR;
  const builtInTemplatesBaseDir = __dirname;

  let finalPath = "";
  const checkedPaths: string[] = []; // 用於更詳細的錯誤報告

  // 1. 檢查 DATA_DIR 中的自定義路徑
  if (dataDir) {
    // path.resolve 可以處理 templateSetName 是絕對路徑的情況
    const customFilePath = path.resolve(dataDir, templateSetName, templatePath);
    checkedPaths.push(`Custom: ${customFilePath}`);
    if (fs.existsSync(customFilePath)) {
      finalPath = customFilePath;
    }
  }

  // 2. 如果未找到自定義路徑，檢查特定的內建模板目錄
  if (!finalPath) {
    // 假設 templateSetName 對於內建模板是 'en', 'zh' 等
    const specificBuiltInFilePath = path.join(
      builtInTemplatesBaseDir,
      `templates_${templateSetName}`,
      templatePath
    );
    checkedPaths.push(`Specific Built-in: ${specificBuiltInFilePath}`);
    if (fs.existsSync(specificBuiltInFilePath)) {
      finalPath = specificBuiltInFilePath;
    }
  }

  // 3. 如果特定的內建模板也未找到，且不是 'en' (避免重複檢查)
  if (!finalPath && templateSetName !== "en") {
    const defaultBuiltInFilePath = path.join(
      builtInTemplatesBaseDir,
      "templates_en",
      templatePath
    );
    checkedPaths.push(`Default Built-in ('en'): ${defaultBuiltInFilePath}`);
    if (fs.existsSync(defaultBuiltInFilePath)) {
      finalPath = defaultBuiltInFilePath;
    }
  }

  // 4. 如果所有路徑都找不到模板，拋出錯誤
  if (!finalPath) {
    throw new Error(
      `Template file not found: '${templatePath}' in template set '${templateSetName}'. Checked paths:\n - ${checkedPaths.join(
        "\n - "
      )}`
    );
  }

  // 5. 讀取找到的文件
  return fs.readFileSync(finalPath, "utf-8");
}
