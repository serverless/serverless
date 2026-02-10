/**
 * Public LangGraph agent with public gateway tools.
 *
 * This agent uses the public gateway (NONE authorization) and has access
 * to the calculator tool which doesn't require authentication.
 *
 * Uses plain StreamableHTTPClientTransport since no IAM auth is required.
 */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { ChatBedrockConverse } from '@langchain/aws'
import { StateGraph, START } from '@langchain/langgraph'
import { MessagesAnnotation } from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { loadMcpTools } from '@langchain/mcp-adapters'
import { z } from 'zod'

const GATEWAY_URL = process.env.BEDROCK_AGENTCORE_GATEWAY_URL
const AWS_REGION = process.env.AWS_REGION || 'us-east-1'

const llm = new ChatBedrockConverse({
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  region: AWS_REGION,
})

/**
 * Connect to the public gateway (no auth required).
 */
async function createPublicMcpSession() {
  const transport = new StreamableHTTPClientTransport(new URL(GATEWAY_URL))

  const client = new Client({
    name: 'langgraph-public-agent',
    version: '1.0.0',
  })

  await client.connect(transport)
  return { client, transport }
}

/**
 * Run the agent with tools discovered from the public gateway.
 */
async function runAgentWithGateway(userMessage) {
  if (!GATEWAY_URL) {
    console.log('[Public Agent] No BEDROCK_AGENTCORE_GATEWAY_URL configured')
    const result = await llm.invoke([{ role: 'user', content: userMessage }])
    return result.content
  }

  console.log(`[Public Agent] Discovering tools from: ${GATEWAY_URL}`)

  const { client, transport } = await createPublicMcpSession()

  try {
    const tools = await loadMcpTools('public-gateway', client)

    for (const t of tools) {
      console.log(`  Discovered tool: ${t.name}`)
    }

    const llmWithTools = llm.bindTools(tools)

    const graphBuilder = new StateGraph(MessagesAnnotation)

    graphBuilder.addNode('chatbot', async (state) => {
      const response = await llmWithTools.invoke(state.messages)
      return { messages: [response] }
    })

    if (tools.length > 0) {
      graphBuilder.addNode('tools', new ToolNode(tools))
      graphBuilder.addConditionalEdges('chatbot', toolsCondition)
      graphBuilder.addEdge('tools', 'chatbot')
    }

    graphBuilder.addEdge(START, 'chatbot')
    const graph = graphBuilder.compile()

    console.log(
      `[Public Agent] Running with tools: ${tools.map((t) => t.name).join(', ')}`,
    )

    const result = await graph.invoke({
      messages: [{ role: 'user', content: userMessage }],
    })

    return result.messages[result.messages.length - 1].content
  } finally {
    await transport.close()
  }
}

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({
      prompt: z.string().describe('The user message to process'),
    }),

    async process(request) {
      console.log(`[Public Agent] Received: ${request.prompt}`)

      const finalMessage = await runAgentWithGateway(request.prompt)

      console.log(`[Public Agent] Response: ${finalMessage}`)

      return JSON.stringify({ result: finalMessage })
    },
  },
})

app.run()
