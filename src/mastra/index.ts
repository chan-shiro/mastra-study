import { Mastra } from '@mastra/core/mastra';
import { LangfuseExporter } from 'langfuse-vercel';

import {
  outlineWriterAgent,
  outlineReflectionAgent,
  chapterParserAgent,
  phaseJudgeAgent,
  contentWriterAgent,
  contentReflectionAgent,
  finalReportWriterAgent,
  finalReportReflectionAgent,
  deepResearchV2Workflow,
} from './DeepResearchV2';

// Import from the DeepResearchWorkflow directory
import { 
  deepResearchWorkflow,
  consoleLogger,
} from './DeepResearchWorkflow';


// Create and export the Mastra instance
export const mastra = new Mastra({
  workflows: { deepResearchWorkflow, deepResearchV2Workflow },
  agents: { 
    // V1 agents
    // taskPlannerAgent, searchListAgent, summaryAgent,
    // V2 agents
    outlineWriterAgent, outlineReflectionAgent,
    phaseJudgeAgent, contentWriterAgent, contentReflectionAgent,
    finalReportWriterAgent, finalReportReflectionAgent,
    chapterParserAgent,
   },
   telemetry: {
    serviceName: 'ai',
    enabled: true,
    export: {
      type: "custom",
      exporter: new LangfuseExporter({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
        secretKey: process.env.LANGFUSE_SECRET_KEY!,
        baseUrl: process.env.LANGFUSE_BASEURL!,
      }),
    }
   },
  logger: consoleLogger,
});

