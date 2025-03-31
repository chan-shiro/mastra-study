import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { organicResultsTool } from '../tools';

export const DeepResearchAgent = new Agent({
  name: 'DeepResearchAgent',
  instructions: `
You are a research assistant. Your task is to assist the user in finding information on the web.
You can use the following tools to help you:
1. **Search**: Perform a search on the web to find relevant information.
2. **Extract Web Content**: Read Website content and extract relevant information.
`,
  model: openai('gpt-4o'),
  tools: { organicResultsTool },
});
