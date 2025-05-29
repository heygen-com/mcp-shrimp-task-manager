/**
 * initProjectRules prompt 生成器
 * 負責將模板和參數組合成最終的 prompt
 */

import {
  loadPrompt,
  generatePrompt,
  loadPromptFromTemplate,
} from "../loader.js";
import { getRulesFilePath } from "../../utils/pathUtils.js";
/**
 * initProjectRules prompt 參數介面
 */
export type InitProjectRulesPromptParams = object;

/**
 * 獲取 initProjectRules 的完整 prompt
 * @returns 生成的 prompt
 */
export function getInitProjectRulesPrompt(): string {
  // 使用基本模板
  const rulesPath = getRulesFilePath();
  const indexTemplate = loadPromptFromTemplate("initProjectRules/index.md");
  const basePrompt = generatePrompt(indexTemplate, {
    rulesPath,
  });

  // 載入可能的自定義 prompt (通過環境變數覆蓋或追加)
  return loadPrompt(basePrompt, "INIT_PROJECT_RULES");
}
