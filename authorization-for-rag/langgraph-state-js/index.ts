/**
 * LangChain + LangGraph Example: Retrieval with Okta FGA (Fine-Grained Authorization)
 */
import "dotenv/config";

import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Annotation, START, StateGraph } from "@langchain/langgraph";
import { Document } from "@langchain/core/documents";

import { FGARetriever } from "./helpers/fga-retriever";
import { readDocuments } from "./helpers/read-documents";

/**
 * Demonstrates the usage of the Okta FGA (Fine-Grained Authorization)
 * with a vector store index to query documents with permission checks.
 *
 * The FGARetriever checks if the user has the "viewer" relation to the document
 * based on predefined tuples in Okta FGA.
 *
 * Example:
 * - A tuple {user: "user:*", relation: "viewer", object: "doc:public-doc"} allows all users to view "public-doc".
 * - A tuple {user: "user:user1", relation: "viewer", object: "doc:private-doc"} allows "user1" to view "private-doc".
 *
 * The output of the query depends on the user's permissions to view the documents.
 */
async function main() {
  console.info(
    "\n..:: LangChain + LangGraph Example: Retrieval with Okta FGA (Fine-Grained Authorization)\n\n"
  );

  const StateAnnotation = Annotation.Root({
    question: Annotation<string>,
    documents: Annotation<Document[]>,
    response: Annotation<string>,
  });

  // UserID
  const user = "user1";
  // 1. Read and load documents from the assets folder
  const documents = await readDocuments();
  // 2. Create an in-memory vector store from the documents for OpenAI models.
  const vectorStore = await MemoryVectorStore.fromDocuments(
    documents,
    new OpenAIEmbeddings({ model: "text-embedding-3-small" })
  );

  const workflow = new StateGraph(StateAnnotation);

  // 3. Create a retriever that uses FGA to gate fetching documents on permissions.
  const retriever = FGARetriever.create({
    retriever: vectorStore.asRetriever(),
    // FGA tuple to query for the user's permissions
    buildQuery: (doc) => ({
      user: `user:${user}`,
      object: `doc:${doc.metadata.id}`,
      relation: "viewer",
    }),
  });

  workflow.addNode("retrieve", async (state) => ({
    documents: await retriever.invoke(state.question),
  }));

  const llm = new ChatOpenAI({ temperature: 0, model: "gpt-4o-mini" });
  workflow.addNode("prompt_llm", async (state) => {
    const context = state.documents.map((doc) => doc.pageContent).join("\n\n");
    const { content } = await llm.invoke([
      {
        role: "system",
        content: `Answer the user's question based on the following context: ${context}. 
          Only use the information provided in the context. If you need more information, ask for it.`,
      },
      {
        role: "user",
        content: `Here is the question: ${state.question}`,
      },
    ]);
    return {
      response: content,
    };
  });
  //@ts-ignore -  not sure why this is a type error
  workflow.addEdge(START, "retrieve");
  //@ts-ignore -  not sure why this is a type error
  workflow.addEdge("retrieve", "prompt_llm");

  const graph = workflow.compile();
  // 4. Convert the retriever into a tool for an agent.
  // The agent will call the tool, rephrasing the original question and
  // populating the "query" argument, until it can answer the user's question.
  // 5. Query the retrieval agent with a prompt
  const state = await graph.invoke({
    question: "Show me forecast for ZEKO?",
  });

  /**
   * Output: `The provided context does not include specific financial forecasts...`
   */
  console.info(state.response);

  /**
   * If we add the following tuple to the Okta FGA:
   *
   *    { user: "user:user1", relation: "viewer", object: "doc:private-doc" }
   *
   * Then, the output will be: `The forecast for Zeko Advanced Systems Inc. (ZEKO) for fiscal year 2025...`
   */
}

main().catch(console.error);
