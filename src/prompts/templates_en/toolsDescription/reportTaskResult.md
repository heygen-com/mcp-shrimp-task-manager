報告任務執行結果：
- `taskId`: (string, required) 欲報告結果的任務ID。
- `status`: (enum, required) 執行結果，必須是 'succeeded' 或 'failed'。
- `error`: (string, optional) 若 `status` 為 'failed'，則必須提供失敗原因或錯誤信息。

此工具用於在 `execute_task` 後明確報告任務的最終狀態。成功時，它會提示您調用 `complete_task`。失敗時，它會檢測是否出現重複失敗循環；如果檢測到循環，它會建議您調用 `consult_expert` 尋求幫助；如果沒有檢測到循環，它會提示您分析錯誤並可能重試 `execute_task` 或修改計劃。 