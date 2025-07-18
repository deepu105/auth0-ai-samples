import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { InMemoryStore, MemorySaver } from '@langchain/langgraph';
import { Calculator } from '@langchain/community/tools/calculator';
import { GmailSearch } from '@langchain/community/tools/gmail';

import { getAccessToken, withGoogleConnection } from './auth0-ai';

const AGENT_SYSTEM_TEMPLATE = `You are a personal assistant named Assistant0. You are a helpful assistant that can answer questions and help with tasks. You have access to a set of tools, use the tools as needed to answer the user's question. Render the email body as a markdown block, do not wrap it in code blocks.`;

const llm = new ChatOpenAI({
  model: 'gpt-4o',
  temperature: 0,
});

// Provide the access token to the Gmail tools
const gmailParams = {
  credentials: {
    accessToken: getAccessToken,
  },
};

const tools = [new Calculator(), withGoogleConnection(new GmailSearch(gmailParams))];

const checkpointer = new MemorySaver();
const store = new InMemoryStore();

/**
 * Use a prebuilt LangGraph agent.
 */
export const agent = createReactAgent({
  llm,
  tools: new ToolNode(tools, {
    // Error handler must be disabled in order to trigger interruptions from within tools.
    handleToolErrors: false,
  }),
  // Modify the stock prompt in the prebuilt agent.
  prompt: AGENT_SYSTEM_TEMPLATE,
  store,
  checkpointer,
});
