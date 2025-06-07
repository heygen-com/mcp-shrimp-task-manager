/**
 * Converts common Markdown syntax to JIRA's Wiki Markup.
 * This function handles basic formatting like headers, bold, italics,
 * lists, links, and inline code.
 *
 * @param markdownText The text string in Markdown format.
 * @returns The converted text string in JIRA Wiki Markup format.
 */
export function convertMarkdownToJiraWikiMarkup(markdownText: string): string {
  if (!markdownText) {
    return "";
  }

  let jiraMarkup = markdownText;

  // Headers (h1-h6)
  jiraMarkup = jiraMarkup.replace(/^(#+)\s(.*)/gm, (match, hashes, content) => {
    const level = hashes.length;
    return `h${level}. ${content}`;
  });

  // Bold (**text**)
  jiraMarkup = jiraMarkup.replace(/\*\*(.*?)\*\*/g, '*$1*');

  // Italics (*text* or _text_)
  jiraMarkup = jiraMarkup.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '_$1_');
  jiraMarkup = jiraMarkup.replace(/_([^_]+)_/g, '_$1_');
  
  // Unordered lists (- item or * item)
  jiraMarkup = jiraMarkup.replace(/^[-*]\s/gm, '* ');

  // Numbered lists (1. item)
  jiraMarkup = jiraMarkup.replace(/^\d+\.\s/gm, '# ');

  // Links ([text](url)) to [text|url]
  jiraMarkup = jiraMarkup.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1|$2]');

  // Inline code (`code`) to {{code}}
  jiraMarkup = jiraMarkup.replace(/`([^`]+)`/g, '{{$1}}');
  
  // Blockquotes (> quote) to bq. quote
  jiraMarkup = jiraMarkup.replace(/^>\s(.*)/gm, 'bq. $1');

  return jiraMarkup;
} 