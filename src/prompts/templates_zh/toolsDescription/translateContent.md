# translate_content 工具

## 目的
**为代理优化的翻译工具**，提供具有上下文感知能力的智能翻译服务，输出结构化JSON响应，便于解析和集成。

## 主要功能
- **JSON优先输出** 专为代理工作流和自动化设计
- **上下文感知翻译** 使用领域和上下文参数
- **代理间对话** 当上下文模糊时，翻译器可以请求澄清
- **翻译记忆系统** 从过往翻译中学习并持续改进
- **保护术语** 永不翻译的术语（公司名称、技术术语）
- **置信度评分** 和备选翻译

## 参数

### 必需参数
- `content` (字符串): 要翻译的内容（可以是单个术语或多个字符串）
- `targetLanguage` (字符串): 目标语言代码（如 "zh-TW", "es", "fr", "ja", "pt-BR"）

### 可选参数
- `sourceLanguage` (字符串，默认: "en"): 源语言代码
- `context` (字符串): 关于内容使用位置/方式的上下文（如 "学生门户中的教育学分", "银行应用中的金融信贷"）
- `domain` (字符串): 翻译的领域/类别（如 "education", "finance", "ui", "error_messages"）
- `requestClarification` (布尔值，默认: false): 当上下文模糊时，是否应请求澄清
- `previousDialogId` (字符串): 继续之前对话的ID
- `returnFormat` (枚举: "json" | "formatted"，默认: "json"): 返回格式 - "json" 用于结构化数据（推荐给代理），"formatted" 用于人类可读的markdown
- `taskId` (字符串): 如果此翻译与特定任务相关的可选任务ID
- `verbose` (布尔值): 启用详细日志记录用于调试

## 默认JSON输出
**默认情况下，此工具返回代理可以轻松解析的结构化JSON：**

```json
{
  "translation": "翻译内容",
  "confidence": 0.95,
  "alternatives": ["备选翻译1", "备选翻译2"],
  "explanation": "简要说明",
  "domain_notes": "领域特定注释",
  "domain": "ui",
  "context": "按钮标签",
  "source": "new_translation" // 或 "cache"
}
```

## 代理使用示例

### 基础翻译
```json
{
  "content": "Items",
  "targetLanguage": "pt-BR",
  "context": "上传页面中项目部分的标题",
  "domain": "ui"
}
```

### 带澄清请求的翻译
```json
{
  "content": "credit",
  "targetLanguage": "zh-TW",
  "requestClarification": true
}
```

### 继续对话
```json
{
  "content": "credit",
  "targetLanguage": "zh-TW",
  "context": "这指的是大学系统中的学术学分",
  "previousDialogId": "dialog_1234567890_abc123def"
}
```

## 代理集成指南

### 1. 基础翻译工作流
```javascript
const result = await translateContent({
  content: "Save",
  targetLanguage: "pt-BR",
  domain: "ui",
  context: "表单中的保存按钮"
});

const translation = JSON.parse(result.content[0].text);
console.log(translation.translation); // "Salvar"
```

### 2. 处理澄清对话
```javascript
const result = await translateContent({
  content: "bank",
  targetLanguage: "es",
  requestClarification: true
});

const response = JSON.parse(result.content[0].text);
if (response.clarificationNeeded) {
  // 用更多上下文继续对话
  const clarified = await translateContent({
    content: "bank",
    targetLanguage: "es",
    context: "存储金钱的金融机构",
    previousDialogId: response.dialogId
  });
}
```

### 3. 批量翻译模式
```javascript
const terms = ["Save", "Cancel", "Submit", "Delete"];
const translations = {};

for (const term of terms) {
  const result = await translateContent({
    content: term,
    targetLanguage: "pt-BR",
    domain: "ui",
    context: "表单中的按钮标签"
  });
  
  const translation = JSON.parse(result.content[0].text);
  translations[term] = translation.translation;
}
```

## 响应结构

### 成功翻译
```json
{
  "translation": "string",      // 翻译文本
  "confidence": 0.95,           // 置信度分数 (0-1)
  "alternatives": ["alt1"],     // 备选翻译
  "explanation": "string",      // 翻译推理
  "domain_notes": "string",     // 领域特定注释
  "domain": "ui",              // 使用的领域
  "context": "string",         // 提供的上下文
  "source": "new_translation"  // "new_translation" 或 "cache"
}
```

### 需要澄清
```json
{
  "dialogId": "dialog_123",
  "clarificationNeeded": true,
  "clarificationQuestion": "您指的是金融银行还是河岸？",
  "currentTranslation": "银行",
  "confidence": 0.7,
  "alternatives": ["银行", "河岸"],
  "explanation": "可能有多种含义"
}
```

## 代理最佳实践

1. **始终提供上下文和领域** 以获得更好的翻译
2. **解析JSON响应** 以提取翻译
3. **检查置信度分数** - 低于0.8的值可能需要审查
4. **处理澄清对话** 通过提供更具体的上下文
5. **使用一致的领域值** 对于相关翻译
6. **缓存翻译** 通过检查"source"字段

## 翻译记忆优势

- **即时检索** 之前翻译的术语
- **一致性** 在您的应用程序中
- **学习** 上下文模式
- **置信度改进** 随时间推移

## 错误处理

如果翻译失败，工具在文本字段中返回错误消息而不是JSON。始终在try-catch中包装JSON.parse()：

```javascript
try {
  const translation = JSON.parse(result.content[0].text);
  // 使用 translation.translation
} catch (error) {
  // 处理错误 - result.content[0].text 包含错误消息
  console.error("翻译失败:", result.content[0].text);
}
``` 