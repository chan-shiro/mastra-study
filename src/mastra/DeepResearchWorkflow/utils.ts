import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { createLogger } from '@mastra/core/logger';

const workspaceDirectory = process.env.WORKSPACE_DIR || '../../workspace';
const taskPlanFile = 'taskplan.md';

export const consoleLogger = createLogger({
  name: 'mastra',
  level: 'info',
});

export const ResearchItemSchema = z.object({
  number: z.number().describe('Research item number'),
  topic: z.string().describe('Topic of the research item'),
  description: z.string().describe('Description of the research item'),
}).describe('Research item schema');

export type ResearchItem = z.infer<typeof ResearchItemSchema>;

export function extractWebsiteResearch(markdown: string): ResearchItem[] {
  // 1. "Website Research" セクションのみを抽出
  const sectionStart = markdown.indexOf("# Website Research");
  if (sectionStart === -1) {
    consoleLogger.error('Website Research section not found');
    return [];
  }
  // 次のヘッダー("#")が現れるまでのテキストを取得
  const sectionEnd = markdown.indexOf("#", sectionStart + 1);
  const sectionText = sectionEnd !== -1
    ? markdown.slice(sectionStart, sectionEnd)
    : markdown.slice(sectionStart);
  if (!sectionText) {
    consoleLogger.error('No content found in Website Research section');
    return [];
  }

  // 2. 正規表現で各項目を抽出する
  // パターン: [ ] {number}. {topic} {description}
  const regex = /\[\s*\]\s*(\d+)\.\s*(.+)/g;
  const items: ResearchItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sectionText)) !== null) {
    items.push({
      number: parseInt(match[1]),
      topic: match[2].trim(),
      description: "",
    });
  }

  return items;
}

export function checkTask(markdown: string, taskTopic: string): string {
  // 正規表現: 行頭の "[ ]" の後に番号と対象タスク名がある行を対象とする（マルチラインモード）
  const regex = new RegExp(`^(\\[\\s*\\])\\s*(\\d+\\.\\s*${taskTopic}.*)`, "m");
  return markdown.replace(regex, "[x] $2");
}

export function writeOutputToFile(output: string, filename: string) {
  const filePath = path.join(workspaceDirectory, filename);
  // Create the directory if it doesn't exist
  if (!fs.existsSync(workspaceDirectory)) {
    fs.mkdirSync(workspaceDirectory, { recursive: true });
  }
  fs.writeFileSync(filePath, output);
}

export function addOutputToFile(output: string, filename: string) {
  const filePath = path.join(workspaceDirectory, filename);
  // Create the directory if it doesn't exist
  if (!fs.existsSync(workspaceDirectory)) {
    fs.mkdirSync(workspaceDirectory, { recursive: true });
  }
  fs.appendFileSync(filePath, output);
}

export type SearchPages = {
  topic: string;
  description: string; // # Page の下の説明文
  query: string;
  links: string[]; // アイテムそのまま
};

export function pagesOutputParser(searchList: string): SearchPages[] {
  // 生成されたオブジェクトを格納する配列
  const searchPages: SearchPages[] = [];

  // 各 Research Topic セクションで分割（最初の空部分は除外）
  const topicSections = searchList.split("# Research Topic").slice(1);

  for (const section of topicSections) {
    // セクション内の "# Pages" より前がタイトルと説明文部分
    const [headerPart, rest] = section.split("# Pages");
    const topicTitle = headerPart.trim();

    // 説明文は "# Pages" と "### Search query:" の間の部分を抽出
    const descriptionMatch = rest.match(/([\s\S]*?)(?=### Search query:)/);
    const description = descriptionMatch ? descriptionMatch[1].trim() : "";

    // 各 "### Search query:" セクションを抽出
    const queryRegex = /### Search query:\s*(.+)\n([\s\S]*?)(?=\n### |\n#|$)/g;
    let queryMatch: RegExpExecArray | null;
    while ((queryMatch = queryRegex.exec(rest)) !== null) {
      const query = queryMatch[1].trim();
      const linksBlock = queryMatch[2].trim();

      // 各リンクは "- [ ] " で始まる行として抽出
      const bulletRegex = /- \[ \] (.+)/g;
      let bulletMatch: RegExpExecArray | null;
      const links: string[] = [];
      while ((bulletMatch = bulletRegex.exec(linksBlock)) !== null) {
        links.push(bulletMatch[1].trim());
      }

      searchPages.push({
        topic: topicTitle,
        description,
        query,
        links
      });
    }
  }
  return searchPages;
}

// バッチ処理のためのユーティリティ関数
export async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // バッチ間に少し待機を入れる（APIレート制限対策）
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

export { workspaceDirectory, taskPlanFile };