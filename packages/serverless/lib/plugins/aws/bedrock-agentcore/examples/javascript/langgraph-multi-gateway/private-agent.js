/**
 * Private LangGraph agent with private gateway tools.
 *
 * This agent uses the private gateway (AWS_IAM authorization) and has access
 * to the internal lookup tool which requires IAM authentication.
 *
 * Uses AWS SigV4 signing for gateway requests.
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

const llm = new ChatBedrockConverse({
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  region: AWS_REGION,
})

/**
 * Resolve AWS credentials from the environment/container metadata.
 */
async function getAwsCredentials() {
  const { defaultProvider } = await import('@aws-sdk/credential-provider-node')
  return await defaultProvider()()
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
 * Connect to the private gateway with AWS SigV4 auth.
 */
async function createPrivateMcpSession() {
  const credentials = await getAwsCredentials()
  const signedFetch = createSignedFetch(credentials)

  const transport = new StreamableHTTPClientTransport(new URL(GATEWAY_URL), {
    fetch: signedFetch,
  })

  const client = new Client({
    name: 'langgraph-private-agent',
    version: '1.0.0',
  })

  await client.connect(transport)
  return { client, transport }
}

/**
 * Run the agent with tools discovered from the private gateway.
 */
async function runAgentWithGateway(userMessage) {
  if (!GATEWAY_URL) {
    console.log('[Private Agent] No BEDROCK_AGENTCORE_GATEWAY_URL configured')
    const result = await llm.invoke([{ role: 'user', content: userMessage }])
    return result.content
  }

  console.log(`[Private Agent] Discovering tools from: ${GATEWAY_URL}`)

  const { client, transport } = await createPrivateMcpSession()

  try {
    const tools = await loadMcpTools('private-gateway', client)

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
      `[Private Agent] Running with tools: ${tools.map((t) => t.name).join(', ')}`,
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
      console.log(`[Private Agent] Received: ${request.prompt}`)

      try {
        const finalMessage = await runAgentWithGateway(request.prompt)

        const text =
          typeof finalMessage === 'string'
            ? finalMessage
            : Array.isArray(finalMessage)
              ? finalMessage
                  .filter((b) => b.type === 'text')
                  .map((b) => b.text)
                  .join('\n')
              : JSON.stringify(finalMessage)

        console.log(`[Private Agent] Response: ${text}`)

        return JSON.stringify({ result: text })
      } catch (err) {
        console.error('[Private Agent] Error:', err)
        return JSON.stringify({
          error: err.message || String(err),
        })
      }
    },
  },
})

app.run()
