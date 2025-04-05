import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { organicResultsTool } from '../tools';

export const DeepResearchAgent = new Agent({
  name: 'DeepResearchAgent',
  instructions: `
  あなたは、デスクトップリサーチャーです。
  チームのメンバーからの調査依頼に答えてレポートを作成します。
  
`,
  model: openai('gpt-4o'),
  tools: { organicResultsTool },
});

