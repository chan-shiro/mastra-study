import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';

import { getJson } from 'serpapi';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { Workflow, Step } from '@mastra/core/workflows';
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { createTool } from '@mastra/core';
import { Readability } from '@mozilla/readability';


const consoleLogger = createLogger({
  name: 'mastra',
  level: 'info',
});

// Tootls
const SearchRequestSchema = z.object({
  query: z.string().describe('Search query'),
  engine: z.enum(['google', 'yahoo', 'bing']).describe('Search engine to use'),
  location: z.string().optional().describe('Search executed in this location').default('Tokyo, Japan'),
  domain: z.string().optional().describe('Search engine domain').default('google.com'),
  country: z.string().optional().describe('Search country code').default('jp'),
  language: z.string().optional().describe('Search language').default('ja'),
  numResults: z.number().optional().describe('Number of results to return').default(50),
  offset: z.number().optional().describe('Offset for pagination').default(0)
});

type SearchRequest = z.infer<typeof SearchRequestSchema>;

// Define schemas for nested objects first
const SearchMetadataSchema = z.object({
  id: z.string(),
  status: z.string(),
  json_endpoint: z.string().url(),
  created_at: z.string(),
  processed_at: z.string(),
  google_url: z.string().url(),
  raw_html_file: z.string().url().optional(),
  total_time_taken: z.number()
});

const SearchParametersSchema = z.object({
  engine: z.string(),
  q: z.string(),
  location_requested: z.string().optional(),
  location_used: z.string().optional(),
  google_domain: z.string().optional(),
  hl: z.string().optional(),
  gl: z.string().optional(),
  safe: z.string().optional(),
  start: z.number().optional(),
  num: z.string().optional(),
  device: z.string().optional()
});

const SearchInformationSchema = z.object({
  query_displayed: z.string(),
  total_results: z.number().optional(),
  time_taken_displayed: z.number().optional(),
  organic_results_state: z.string().optional()
});

const SitelinkSchema = z.object({
  title: z.string(),
  link: z.string().url()
});

const AdSchema = z.object({
  position: z.number(),
  block_position: z.string().optional(),
  title: z.string(),
  link: z.string().url(),
  displayed_link: z.string().optional(),
  tracking_link: z.string().url().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
  sitelinks: z.array(SitelinkSchema).optional()
});

const SourceSchema = z.object({
  name: z.string(),
  link: z.string().url()
});

const KnowledgeGraphSchema = z.object({
  title: z.string().optional(),
  entity_type: z.string().optional(),
  kgmid: z.string().optional(),
  knowledge_graph_search_link: z.string().url().optional(),
  serpapi_knowledge_graph_search_link: z.string().url().optional(),
  description: z.string().optional(),
  source: SourceSchema.optional(),
  icd_10: z.string().optional()
});

const RelatedQuestionSchema = z.object({
  question: z.string(),
  snippet: z.string().nullable(),
  title: z.string().optional(),
  link: z.string().url().optional(),
  list: z.array(z.string()).optional(),
  displayed_link: z.string().nullable(),
  next_page_token: z.string().optional(),
  serpapi_link: z.string().url().optional(),
  date: z.string().optional(),
  source_logo: z.string().url().optional().nullable(),
});

const InlineSitelinkSchema = z.object({
  inline: z.array(SitelinkSchema).optional()
});

const OrganicResultSchema = z.object({
  position: z.number(),
  title: z.string(),
  link: z.string().url(),
  redirect_link: z.string().url().optional(),
  displayed_link: z.string().optional(),
  favicon: z.string().url().optional(),
  snippet: z.string().optional(),
  snippet_highlighted_words: z.array(z.string()).optional(),
  sitelinks: InlineSitelinkSchema.optional(),
  source: z.string().optional()
});

const RelatedSearchSchema = z.object({
  block_position: z.number().optional(),
  query: z.string(),
  link: z.string().url(),
  serpapi_link: z.string().url()
});

const PaginationSchema = z.object({
  current: z.number(),
  next: z.string().url().optional(),
  other_pages: z.record(z.string(), z.string().url())
});

const SerpapiPaginationSchema = z.object({
  current: z.number(),
  next_link: z.string().url().optional(),
  next: z.string().url().optional(),
  other_pages: z.record(z.string(), z.string().url())
});

const AIOverviewSchema = z.object({
  page_token: z.string().optional(),
  serpapi_link: z.string().url().optional()
});

// Main schema for the entire search response
const SearchResponseSchema = z.object({
  search_metadata: SearchMetadataSchema,
  search_parameters: SearchParametersSchema,
  search_information: SearchInformationSchema,
  ads: z.array(AdSchema).optional(),
  knowledge_graph: KnowledgeGraphSchema.optional(),
  related_questions: z.array(RelatedQuestionSchema).optional(),
  ai_overview: AIOverviewSchema.optional(),
  organic_results: z.array(OrganicResultSchema).optional(),
  related_searches: z.array(RelatedSearchSchema).optional(),
  pagination: PaginationSchema.optional(),
  serpapi_pagination: SerpapiPaginationSchema.optional()
});

// Type inference
type SearchResponse = z.infer<typeof SearchResponseSchema>;

async function search(request: SearchRequest): Promise<SearchResponse> {
  consoleLogger.info(`Searching with query: ${request.query}`);
  const { query, engine, location, domain, country, language, numResults, offset } = request;
  return getJson({
    engine,
    q: query,
    location,
    domain,
    country,
    language,
    num: numResults,
    start: offset,
    api_key: process.env.SERPAPI_API_KEY,
  }) as Promise<SearchResponse>;
}

type OrganicResult = z.infer<typeof OrganicResultSchema>;

const OrganicResultsSchema = z.array(z.object({
  title: z.string(),
  link: z.string().url(),
  snippet: z.string().optional(),
}));

async function GetOrganicResultsInText(request: SearchRequest): Promise<{
  title: string;
  link: string;
  snippet: string | undefined;
}[]> {
  const response = await search(request);
  const parsedResponse = SearchResponseSchema.parse(response);
  const results = await extractOrganicResults(parsedResponse);
  return results.map((result) => ({
    title: result.title,
    link: result.link,
    snippet: result.snippet,
  }));
}

async function extractOrganicResults(response: SearchResponse): Promise<OrganicResult[]> {
  if (!response.organic_results) {
    throw new Error('No organic results found');
  }
  return response.organic_results;
}

export const organicResultsTool = createTool({
  id: 'get-organic-search-results',
  description: 'Get organic search results from a search engine',
  inputSchema: SearchRequestSchema,
  outputSchema: OrganicResultsSchema,
  execute: async ({ context }) => {
    const results = await GetOrganicResultsInText(context);
    return results;
  }
});

export const readWebPageTool = createTool({
  id: 'read-web-page',
  description: 'Read a web page and extract its content',
  inputSchema: z.object({
    url: z.string().url().describe('URL of the web page to read'),
  }),
  outputSchema: z.object({
    title: z.string().describe('Title of the web page'),
    content: z.string().describe('Content of the web page'),
    url: z.string().url().describe('URL of the web page'),
  }),
  execute: async ({ context }) => {
    const { url } = context;
    consoleLogger.info(`Reading web page: ${url}`);
    // Chromium ブラウザをヘッドレスモードで起動
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const title = await page.title();
    consoleLogger.info(`Page title: ${title}`);
    const html = await page.content();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    let content = "";
    try {
      const article = reader.parse();
      if (article && article.title && article.textContent) {
        content = article.textContent!;
      }
    } catch (error) {
      console.error('Error parsing article:', error);
      // コンテンツと関係なさそうなタグを削除（例：head, script, iframe）
      await page.evaluate(() => {
        const selectorsToRemove = ['head', 'script', 'iframe'];
        selectorsToRemove.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => element.remove());
        });
      });
      // 抽出対象のコンテンツを持つセレクタのリスト（必要に応じて調整してください）
      const selectors = ['main', 'article', '#content', '.content'];

      // セレクタ順に要素を探し、最初に見つかった要素の innerHTML を取得する
      content = await page.evaluate((selectors) => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            return el.innerHTML;
          }
        }
        // どれも見つからなかった場合は、ページ全体の HTML を返す
        return document.body.innerText;
      }, selectors);
    }

    // ブラウザを終了
    await browser.close();

    return {
      title,
      content,
      url,
    }
  },
});

const llm = openai('gpt-4o');

const workspaceDirectory = process.env.WORKSPACE_DIR || '../../../workspace';
const taskPlanFile = 'taskplan.md';

// Agent

export const taskPlannerAgent = new Agent({
  name: 'Task-Planner-Agent',
  instructions: `
You are a leading researcher. Your task is to extract research topic from user's query and break down the research topic into smaller tasks.
  You will receive a topic and you need to create a list of tasks that need to be completed to research the topic.
  Your research output is expected to be thorough and detailed. Web search can be very deep and comprehensive.

  Planning output should be in the following format:
  
  # Website Research
    [Instructions of the research task overview]

[ ] 1. [Research topic 1]

[ ] 2. [Research topic 2]
    ... up to 10 tasks

  # Analyze the research output
    [Instructions of analyzing the research output]

[ ] 1. [Analyze topic 1]

[ ] 2. [Analyze topic 2]
    ... up to 10 tasks

  # Write a report
    Write a report based on the research output.
    If the output contains comparable information, write a table comparing the information.
    Report should be in markdown format.

  **Note: You are expected to generate outputs in user's language. However, research should not be restricted in user's language.**
  **Note: You can preliminary very shallow web search for a better planning.**
  `,
  model: llm,
  tools: { organicResultsTool },
});


const searchListAgent = new Agent({
  name: 'Search-List-Agent',
  instructions: `
  You are a leading researcher.
  Your task is to create a list of urls to read based on the research topic.
  You will receive a research topic and you need to create a list of urls to read.
  You have to pick 20 urls for the topic.
  You need to evaluate the page and decide if the page is useful for the research topic.

  You can use web search to find the urls.
  Your research output is expected to be thorough and detailed. Web search can be very deep and comprehensive.

  Your output should be in the following format:
  # Research Topic
  [Research topic]
  # Pages
  [Instructions of the research task overview]

  ### Search query: [Query you used to search]
- [ ] [Title 1 with link] -- [Snippet]
- [ ] [Title 2 with link]
...

### Search query: [Query you used to search]
- [ ] [Title 3 with link] -- [Snippet]
- [ ] [Title 4 with link]
  ... up to 10 urls
  **Note: You are expected to generate outputs in user's language. However, research should not be restricted in user's language.**
`,
  tools: { organicResultsTool, readWebPageTool },
  model: llm,
});

const summaryAgent = new Agent({
  name: 'Summary-Agent',
  instructions: `
  You are a leading researcher.
  **Your task is to summarize the website content based on the topic-relevant themes.**
  You will receive a research topic and page url.
  You need to summarize the page content.

  Your output should be in the following format:
  ### [Title of the page with link]
  **概要:**\
  [Summary of the page content]
`,
  model: llm,
  tools: { readWebPageTool },
});

const ResearchItemSchema = z.object({
  number: z.number().describe('Research item number'),
  topic: z.string().describe('Topic of the research item'),
  description: z.string().describe('Description of the research item'),
}).describe('Research item schema');

type ResearchItem = z.infer<typeof ResearchItemSchema>;

function extractWebsiteResearch(markdown: string): ResearchItem[] {
  // 1. "Website Research" セクションのみを抽出
  const sectionStart = markdown.indexOf("# Website Research");
  if (sectionStart === -1) return [];
  // 次のヘッダー("#")が現れるまでのテキストを取得
  const sectionEnd = markdown.indexOf("#", sectionStart + 1);
  const sectionText = sectionEnd !== -1
    ? markdown.slice(sectionStart, sectionEnd)
    : markdown.slice(sectionStart);

  // 2. 正規表現で各項目を抽出する
  // パターン: [ ] {number}. {topic}\n  - {description}
  const regex = /\[\s*\]\s*(\d+)\.\s*(.+?)\n\s*-\s*(.+)/g;
  const items: ResearchItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sectionText)) !== null) {
    items.push({
      number: parseInt(match[1]),
      topic: match[2].trim(),
      description: match[3].trim(),
    });
  }

  return items;
}

const summarizeTopicResultAgent = new Agent({
  name: 'Summarize-Topic-Result-Agent',
  instructions: `
  You are a research leader.
  Your task is to summarize the research output based on the topic-relevant themes.
  You will receive a research topic and the research output for each page.
  You need to summarize the research output based on the topic-relevant themes.
  You must add references to the original pages.
  Output should be in markdown format.
  `,
  model: llm,
});

function checkTask(markdown: string, taskTopic: string): string {
  // 正規表現: 行頭の "[ ]" の後に番号と対象タスク名がある行を対象とする（マルチラインモード）
  const regex = new RegExp(`^(\\[\\s*\\])\\s*(\\d+\\.\\s*${taskTopic}.*)`, "m");
  return markdown.replace(regex, "[x] $2");
}

function writeOutputToFile(output: string, filename: string) {
  const filePath = path.join(workspaceDirectory, filename);
  fs.writeFileSync(filePath, output);
}

function addOutputToFile(output: string, filename: string) {
  const filePath = path.join(workspaceDirectory, filename);
  fs.appendFileSync(filePath, output);
}
// Workflow 
export const deepResearchWorkflow = new Workflow({
  name: 'Deep-Research-Workflow',
  triggerSchema: z.object({
    query: z.string().describe('Research request from the user'),
  }),
});

const taskPlannerStep = new Step({
  id: 'Task-Planner-Step',
  inputSchema: z.object({
    query: z.string().describe('Research request from the user'),
  }),
  outputSchema: z.string().describe('Task plan in markdown format'),
  execute: async ({ context }) => {
    consoleLogger.info('Executing Task Planner Step');
    const query = context.triggerData.query;
    const response = await taskPlannerAgent.generate(query);
    consoleLogger.info(`✈️ Task plan generated: \n${response.text}`);
    return response.text;
  }
});

const extractWebsiteResearchStep = new Step({
  id: 'Extract-Website-Research-Step',
  outputSchema: z.array(ResearchItemSchema),
  execute: async ({ context }) => {
    consoleLogger.info('🏃🏻‍♀️ Executing Extract Website Research Step');
    const markdown = context.getStepResult(taskPlannerStep);
    const researchItems = extractWebsiteResearch(markdown);
    // Add the research items to the context for later use
    context.inputData.researchItems = researchItems;
    context.inputData.searchList = "";
    consoleLogger.info(`Extracted research items: \n${researchItems}`);
    return researchItems;
  }
});

const createSearchListStep = new Step({
  id: 'Create-Search-List-Step',
  outputSchema: z.object({
    searchList: z.string().describe('Search list in markdown format'),
    number: z.number().describe('Current research item number'),
  }),
  execute: async ({ context }) => {
    consoleLogger.info('🏃🏻‍♀️ Executing Create Search List Step');
    const researchItems = context.getStepResult(extractWebsiteResearchStep);
    const number = context.getStepResult<{ number: number }>('Create-Search-List-Step')?.number ?? 0;
    let result = context.getStepResult<{ searchList: string }>('Create-Search-List-Step')?.searchList ?? 0;
    const researchItem = researchItems[number];
    if (!researchItem) {
      throw new Error(`Research item with number ${number} not found`);
    }
    const { topic, description } = researchItem;
    const query = `Research topic: ${topic}\nDescription: ${description}`;
    const response = await searchListAgent.generate(query);
    result += `${response.text}\n\n`;
    consoleLogger.info('Search list generated:', response);
    return {
      searchList: result,
      number: number + 1,
    };
  }
});

type SearchPages = {
  topic: string;
  description: string; // # Page の下の説明文
  query: string;
  links: string[]; // アイテムそのまま
};


function pagesOutputParser(searchList: string): SearchPages[] {
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

const searchPagesStep = new Step({
  id: 'Search-Pages-Step',
  outputSchema: z.string().describe('Search pages in markdown format'),
  execute: async ({ context }) => {
    consoleLogger.info('🏃🏻‍♀️ Executing Search Pages Step');
    const searchList = context.getStepResult(createSearchListStep);
    const searchPages = pagesOutputParser(searchList.searchList);
    consoleLogger.info('Parsed search pages:', searchPages);
    let deepResearchResult = "";
    for (const searchPage of searchPages) {
      const { topic, description, query, links } = searchPage;
      let searchResult = `
# Research Topic: ${topic}
## Description
${description}
## Search query
${query}
## Pages\n\n
      `;
      for (const link of links) {
        consoleLogger.info(`Reading page: ${link}`);
        const summary = await summaryAgent.generate(
          `Research topic: ${topic}\nDescription: ${description}\nPage URL: ${link}`
        );
        consoleLogger.info(`Page summary: ${summary.text}`);
        searchResult += summary.text + "\n\n";
      }
      const topicSummary = await summarizeTopicResultAgent.generate(searchResult);
      consoleLogger.info(`🧸 Topic summary: ${topicSummary.text}`);
      deepResearchResult += topicSummary.text + "\n\n";
    }
    // Write the search pages to a file
    return deepResearchResult;
  }
});

const finalizeOutputStep = new Step({
  id: 'Finalize-Output-Step',
  outputSchema: z.string().describe('Final output in markdown format'),
  execute: async ({ context }) => {
    consoleLogger.info('🏃🏻‍♀️ Executing Finalize Output Step');
    const researchOutput = context.getStepResult(createSearchListStep);
    const searchPages = context.getStepResult(searchPagesStep);
    const researchItems = context.getStepResult(extractWebsiteResearchStep);
    const taskPlan = context.getStepResult(taskPlannerStep);

    const finalizeAgent = new Agent({
      name: 'Finalize-Agent',
      instructions: `
You are a research leader.
Your task is to finalize the research output based on the research items and the search pages.
You will receive the task plan, research items, and the search pages.
You need to finalize the research output based on the research items and the search pages.
Output should be in markdown format.
`,
      model: llm
    });
    const response = await finalizeAgent.generate(
      `## User query: \n${context.triggerData.query}\n\n` +
      `## Original Task plan:\n${taskPlan}\n\n` +
      `## Summary of research items:\n${researchOutput}\n\n`
    );
    const finalMarkdown = response.text;
    return finalMarkdown;
  },
});

deepResearchWorkflow
  .step(taskPlannerStep)
  .then(extractWebsiteResearchStep)
  .then(createSearchListStep)
  .until(async ({ context }) => {
    const researchItems = context.getStepResult(extractWebsiteResearchStep);
    const number = context.getStepResult<{ number: number }>('Create-Search-List-Step')?.number ?? 0;
    consoleLogger.info('Current research item number:', {
      number
    });
    if (number >= researchItems.length) {
      consoleLogger.info('All research items processed');
      const result = context.getStepResult<{ searchList: string }>('Create-Search-List-Step');
      consoleLogger.info('Final search list:', result);
      return true;
    } else {
      return false;
    }
  }, createSearchListStep)
  .then(searchPagesStep)
  .then(finalizeOutputStep).commit();

export const mastra = new Mastra({
  workflows: { deepResearchWorkflow },
  agents: { taskPlannerAgent, searchListAgent, summaryAgent },
  logger: consoleLogger,
});

// Export the functions so they can be tested
export { extractWebsiteResearch, checkTask };
