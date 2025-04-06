import { Workflow, Step } from '@mastra/core/workflows';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

import { taskPlannerAgent, searchListAgent, summaryAgent, summarizeTopicResultAgent, finalizeAgent } from './agents';
import { readWebPageTool } from './tools';
import { 
  consoleLogger, 
  ResearchItemSchema, 
  extractWebsiteResearch, 
  taskPlanFile, 
  writeOutputToFile, 
  addOutputToFile, 
  pagesOutputParser, 
  processBatch 
} from './utils';

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
    // Write the task plan to a file
    writeOutputToFile(response.text, taskPlanFile);
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
  outputSchema: z.string().describe('Search list in markdown format'),
  execute: async ({ context }) => {
    consoleLogger.info('🏃🏻‍♀️ Executing Create Search List Step');
    const researchItems = context.getStepResult(extractWebsiteResearchStep);

    // Process research items in parallel batches (5 items at a time)
    const batchSize = 3;
    const searchResults = await processBatch(researchItems, batchSize, async (researchItem) => {
      const { topic, description } = researchItem;
      const query = `Research topic: ${topic}\nDescription: ${description}`;
      const response = await searchListAgent.generate(query);
      consoleLogger.info(`Search list generated for topic: ${topic}`);
      return response.text;
    });

    // Combine all results
    const result = searchResults.join('\n\n');
    // Write the search list to a file
    writeOutputToFile(result, 'search_list.md');
    return result;
  }
});

const searchPagesStep = new Step({
  id: 'Search-Pages-Step',
  outputSchema: z.string().describe('Search pages in markdown format'),
  execute: async ({ context }) => {
    consoleLogger.info('🏃🏻‍♀️ Executing Search Pages Step');
    const searchList = context.getStepResult(createSearchListStep);
    const searchPages = pagesOutputParser(searchList);
    consoleLogger.info(`Parsed search pages: ${JSON.stringify(searchPages, null, 2)}`);
    let deepResearchResult = "";

    // Process search pages in batches for better performance and rate limiting
    const searchPageBatchSize = 2; // Process 2 search pages at a time
    const results = await processBatch(searchPages, searchPageBatchSize, async (searchPage) => {
      const { topic, description, query, links } = searchPage;
      let searchResult = `
# Research Topic: ${topic}
## Description
${description}
## Search query
${query}
## Pages\n\n
      `;

      // バッチ処理で並列実行（一度に5件ずつ処理）
      const batchSize = 3;
      const summaries = await processBatch(links, batchSize, async (link) => {
        consoleLogger.info(`Reading page: ${link}`);
        const summary = await summaryAgent.generate(
          `Research topic: ${topic}\nDescription: ${description}\nPage URL: ${link}`
        );
        consoleLogger.info(`Page summary: ${summary.text}`);
        return summary.text;
      });

      // Add all summaries to the search result
      searchResult += summaries.join('\n\n');

      // Generate the topic summary
      const topicSummary = await summarizeTopicResultAgent.generate(searchResult);
      consoleLogger.info(`🧸 Topic summary: ${topicSummary.text}`);
      addOutputToFile(topicSummary.text, topic.replace(/\\s+/g, '_') + '.md');
      return topicSummary.text;
    });

    // Combine all results
    deepResearchResult = results.join('\n\n');
    writeOutputToFile(deepResearchResult, 'deep_research_output.md');
    // Write the search pages to a file
    return deepResearchResult;
  }
});

const finalizeOutputStep = new Step({
  id: 'Finalize-Output-Step',
  outputSchema: z.string().describe('Final output in markdown format'),
  execute: async ({ context }) => {
    consoleLogger.info('🏃🏻‍♀️ Executing Finalize Output Step');
    const searchPages = context.getStepResult(searchPagesStep);
    const taskPlan = context.getStepResult(taskPlannerStep);

    const response = await finalizeAgent.generate(
      `## User query: \n${context.triggerData.query}\n\n` +
      `## Original Task plan:\n${taskPlan}\n\n` +
      `## Summary of research items:\n${searchPages}\n\n`
    );
    const finalMarkdown = response.text;
    writeOutputToFile(finalMarkdown, 'final_output.md');
    return finalMarkdown;
  },
});

// Configure the workflow steps
deepResearchWorkflow
  .step(taskPlannerStep)
  .then(extractWebsiteResearchStep)
  .then(createSearchListStep)
  .then(searchPagesStep)
  .then(finalizeOutputStep).commit();