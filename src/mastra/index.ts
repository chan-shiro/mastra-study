import { Mastra } from '@mastra/core/mastra';

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
  logger: consoleLogger,
});

