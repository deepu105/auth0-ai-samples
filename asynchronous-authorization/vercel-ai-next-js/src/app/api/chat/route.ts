import { NextRequest } from 'next/server';
import { streamText, Message, createDataStreamResponse, DataStreamWriter } from 'ai';
import { openai } from '@ai-sdk/openai';
import { setAIContext } from '@auth0/ai-vercel';

import { shopOnlineTool } from '@/lib/tools/shop-online';

const AGENT_SYSTEM_TEMPLATE = `You are a personal assistant named Assistant0. You are a helpful assistant that can answer questions and help with tasks. You have access to a set of tools, use the tools as needed to answer the user's question. Render the email body as a markdown block, do not wrap it in code blocks.`;

/**
 * This handler initializes and calls an tool calling agent.
 */
export async function POST(req: NextRequest) {
  const request = await req.json();

  const messages = sanitizeMessages(request.messages);

  setAIContext({ threadID: request.id });

  const tools = {
    shopOnlineTool,
  };

  return createDataStreamResponse({
    execute: async (dataStream: DataStreamWriter) => {
      const result = streamText({
        model: openai('gpt-4o-mini'),
        system: AGENT_SYSTEM_TEMPLATE,
        messages,
        maxSteps: 5,
        tools,
      });

      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
      });
    },
    onError: (err: any) => {
      console.log(err);
      return `An error occurred! ${err.message}`;
    },
  });
}

// Vercel AI tends to get stuck when there are incomplete tool calls in messages
const sanitizeMessages = (messages: Message[]) => {
  return messages.filter(
    (message) => !(message.role === 'assistant' && message.parts && message.parts.length > 0 && message.content === ''),
  );
};
