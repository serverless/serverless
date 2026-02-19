/**
 * LangGraph agent with Gateway tools.
 *
 * This agent demonstrates:
 * - BedrockAgentCoreApp entrypoint pattern for JavaScript
 * - LangGraph with Claude Sonnet 4.5
 * - Gateway tool discovery via BEDROCK_AGENTCORE_GATEWAY_URL
 * - MCP client with AWS SigV4 authentication
 */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { ChatBedrockConverse } from '@langchain/aws'
import { StateGraph, START } from '@langchain/langgraph'
import { MessagesAnnotation } from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { loadMcpTools } from '@langchain/mcp-adapters'
import { AwsV4Signer } from 'aws4fetch'
import { z } from 'zod'

const GATEWAY_URL = process.env.BEDROCK_AGENTCORE_GATEWAY_URL
const AWS_REGION = process.env.AWS_REGION || 'us-east-1'

// Initialize Claude Sonnet 4.5 via US inference profile
const llm = new ChatBedrockConverse({
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  region: AWS_REGION,
})

/**
 * Resolve AWS credentials from the environment/container metadata.
 */
async function getAwsCredentials() {
  const { defaultProvider } = await import('@aws-sdk/credential-provider-node')
  const creds = await defaultProvider()()
  return creds
}

/**
 * Create a SigV4-signed fetch function for the gateway.
 */
function createSignedFetch(credentials) {
  return async (url, init) => {
    const signer = new AwsV4Signer({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      service: 'bedrock-agentcore',
      region: AWS_REGION,
      url,
      method: init?.method || 'POST',
      headers: init?.headers,
      body: init?.body,
    })

    const signed = await signer.sign()
    return globalThis.fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: init?.body,
    })
  }
}

/**
 * Create an MCP client connected to the gateway with SigV4 auth.
 */
async function createMcpSession() {
  const credentials = await getAwsCredentials()
  const signedFetch = createSignedFetch(credentials)

  // Create transport with SigV4-signed fetch
  const transport = new StreamableHTTPClientTransport(new URL(GATEWAY_URL), {
    fetch: signedFetch,
  })

  const client = new Client({
    name: 'langgraph-gateway-agent',
    version: '1.0.0',
  })

  await client.connect(transport)
  return { client, transport }
}

/**
 * Run the LangGraph agent with tools discovered from Gateway.
 */
async function runAgentWithGateway(userMessage) {
  if (!GATEWAY_URL) {
    console.log(
      'No BEDROCK_AGENTCORE_GATEWAY_URL configured, running without gateway tools',
    )
    const result = await llm.invoke([{ role: 'user', content: userMessage }])
    return result.content
  }

  console.log(`Discovering gateway tools from: ${GATEWAY_URL}`)

  let mcpClient, transport
  try {
    const session = await createMcpSession()
    mcpClient = session.client
    transport = session.transport
    console.log('MCP session connected successfully')
  } catch (err) {
    console.error('Failed to connect to gateway MCP:', err.message || err)
    throw err
  }

  try {
    // Load MCP tools as LangChain tools
    const tools = await loadMcpTools('gateway', mcpClient)

    for (const t of tools) {
      console.log(`  Discovered tool: ${t.name}`)
    }

    // Bind tools to LLM
    const llmWithTools = llm.bindTools(tools)

    // Build the graph with discovered tools
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
      `Running agent with tools: ${tools.map((t) => t.name).join(', ')}`,
    )

    const result = await graph.invoke({
      messages: [{ role: 'user', content: userMessage }],
    })

    return result.messages[result.messages.length - 1].content
  } finally {
    await transport.close()
  }
}

// Initialize the AgentCore application
const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({
      prompt: z.string().describe('The user message to process'),
    }),

    async process(request) {
      console.log(`Received message: ${request.prompt}`)

      try {
        const finalMessage = await runAgentWithGateway(request.prompt)

        // Handle content blocks (array) or plain string from LLM
        const text =
          typeof finalMessage === 'string'
            ? finalMessage
            : Array.isArray(finalMessage)
              ? finalMessage
                  .filter((b) => b.type === 'text')
                  .map((b) => b.text)
                  .join('\n')
              : JSON.stringify(finalMessage)

        console.log(`Responding with: ${text}`)

        return JSON.stringify({ result: text })
      } catch (err) {
        console.error('Agent invocation error:', err)
        return JSON.stringify({
          error: err.message || String(err),
        })
      }
    },
  },
})

app.run()
