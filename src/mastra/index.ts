import { Mastra } from '@mastra/core/mastra';

// Import from the DeepResearchWorkflow directory
import { 
  deepResearchWorkflow,
  taskPlannerAgent,
  searchListAgent,
  summaryAgent,
  organicResultsTool,
  readWebPageTool,
  consoleLogger,
  extractWebsiteResearch,
  checkTask
} from './DeepResearchWorkflow';

// Create and export the Mastra instance
export const mastra = new Mastra({
  workflows: { deepResearchWorkflow },
  agents: { taskPlannerAgent, searchListAgent, summaryAgent },
  logger: consoleLogger,
});

// Re-export the functions and tools for use elsewhere
export {
  deepResearchWorkflow,
  taskPlannerAgent,
  searchListAgent,
  summaryAgent,
  organicResultsTool,
  readWebPageTool,
  extractWebsiteResearch,
  checkTask
};
