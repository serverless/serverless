/**
 * LangGraph Custom Code Interpreter Agent
 *
 * Demonstrates using a custom AgentCore code interpreter (with PUBLIC network mode)
 * instead of the AWS-managed default interpreter (SANDBOX mode).
 *
 * Key difference from default interpreter:
 * - Default: Uses "aws.codeinterpreter.v1" identifier (SANDBOX - no network)
 * - Custom: Uses your own interpreter ID with PUBLIC network access
 *
 * Environment variables:
 * - CUSTOM_INTERPRETER_ID: Code interpreter identifier from serverless deployment
 * - MODEL_ID: Bedrock model ID (default: Claude Sonnet)
 * - AWS_REGION: AWS region (auto-injected by AgentCore)
 */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { CodeInterpreter } from 'bedrock-agentcore/code-interpreter'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
const MODEL_ID =
  process.env.MODEL_ID || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
const CUSTOM_INTERPRETER_ID = process.env.CUSTOM_INTERPRETER_ID

if (!CUSTOM_INTERPRETER_ID) {
  console.warn('CUSTOM_INTERPRETER_ID not set - will use default interpreter')
}

console.log(`Custom Interpreter ID: ${CUSTOM_INTERPRETER_ID}`)
console.log(`Model ID: ${MODEL_ID}`)

// Create code execution tool that uses the custom interpreter
const executePythonCode = tool(
  async ({ code }) => {
    console.log(`Executing code:\n${code.substring(0, 200)}...`)

    const codeInterpreter = new CodeInterpreter({
      region: AWS_REGION,
      identifier: CUSTOM_INTERPRETER_ID,
    })

    try {
      // executeCode handles session creation automatically
      const result = await codeInterpreter.executeCode({
        code,
        language: 'python',
      })

      console.log(`Execution result: ${String(result).substring(0, 200)}...`)
      return result || 'Code executed successfully (no output)'
    } finally {
      try {
        await codeInterpreter.stopSession()
        console.log('Code interpreter session stopped')
      } catch {
        // ignore cleanup errors
      }
    }
  },
  {
    name: 'execute_python_code',
    description:
      'Execute Python code in a secure AWS sandbox environment with PUBLIC network access. Can perform calculations, data analysis, and fetch data from external APIs.',
    schema: z.object({
      code: z.string().describe('Python code to execute'),
    }),
  },
)

// Initialize LLM
const model = new ChatBedrockConverse({
  model: MODEL_ID,
  region: AWS_REGION,
})

// Create LangGraph agent with our custom code execution tool
const agent = createReactAgent({
  llm: model,
  tools: [executePythonCode],
})

// Initialize the AgentCore application
const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({
      prompt: z.string().describe('The user message to process'),
    }),

    async process(request, context) {
      const sessionId = context?.sessionId || 'default'
      console.log(`Session ID: ${sessionId}`)
      console.log(`Prompt: ${request.prompt}`)
      console.log(`Using custom interpreter: ${CUSTOM_INTERPRETER_ID}`)

      try {
        const result = await agent.invoke({
          messages: [{ role: 'user', content: request.prompt }],
        })

        const finalMessage = result.messages[result.messages.length - 1]
        const response = finalMessage.content
        console.log(`Response: ${String(response).substring(0, 200)}...`)

        return JSON.stringify({
          result: response,
          interpreter_id: CUSTOM_INTERPRETER_ID,
          network_mode: 'PUBLIC',
        })
      } catch (err) {
        console.error(`Error: ${err.message}`)
        return JSON.stringify({ error: err.message })
      }
    },
  },
})

app.run()
