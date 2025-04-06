import { createTool } from '@mastra/core';
import { getJson } from 'serpapi';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { z } from 'zod';
import { consoleLogger } from './utils';

// Search tool schemas
export const SearchRequestSchema = z.object({
  query: z.string().describe('Search query'),
  engine: z.enum(['google', 'yahoo', 'bing']).describe('Search engine to use'),
  location: z.string().optional().describe('Search executed in this location').default('Tokyo, Japan'),
  domain: z.string().optional().describe('Search engine domain').default('google.com'),
  country: z.string().optional().describe('Search country code').default('jp'),
  language: z.string().optional().describe('Search language').default('ja'),
  numResults: z.number().optional().describe('Number of results to return').default(50),
  offset: z.number().optional().describe('Offset for pagination').default(0)
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

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
  query: z.string().optional(), // オプショナルに変更
  link: z.string().url().optional(), // オプショナルに変更
  serpapi_link: z.string().url().optional() // オプショナルに変更
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
export const SearchResponseSchema = z.object({
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
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type OrganicResult = z.infer<typeof OrganicResultSchema>;

export const OrganicResultsSchema = z.array(z.object({
  title: z.string(),
  link: z.string().url(),
  snippet: z.string().optional(),
}));

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

// Tool definitions
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
    url: z.string().describe('URL of the web page to read'),
  }),
  outputSchema: z.object({
    title: z.string().describe('Title of the web page'),
    content: z.string().describe('Content of the web page'),
    url: z.string().describe('URL of the web page'),
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
      let err = error as any;
      consoleLogger.error(`Error parsing article: ${err.message ? err.message : JSON.stringify(err)}`);
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
        // どれも見つからなかった場合は、ページ全体の TEXT を返す
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