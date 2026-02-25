/**
 * LangGraph Code Interpreter Agent
 *
 * Demonstrates using AWS-managed default code interpreter
 * for code execution in AI agents.
 *
 * Uses CodeInterpreter from bedrock-agentcore for sandboxed execution.
 *
 * Environment variables:
 * - MODEL_ID: Bedrock model ID (default: Claude Sonnet)
 * - AWS_REGION: AWS region (auto-injected by AgentCore)
 */

import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { CodeInterpreter } from 'bedrock-agentcore/code-interpreter'
import { createAgent } from 'langchain'
import { ChatBedrockConverse } from '@langchain/aws'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
const MODEL_ID =
  process.env.MODEL_ID || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'

console.log(`Model ID: ${MODEL_ID}`)
console.log(`Region: ${AWS_REGION}`)

// Initialize LLM
const model = new ChatBedrockConverse({
  model: MODEL_ID,
  region: AWS_REGION,
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

      // Create code interpreter per request (for session isolation)
      const codeInterpreter = new CodeInterpreter({ region: AWS_REGION })

      try {
        // Define code execution tools wrapping CodeInterpreter methods

        const executeCode = tool(
          async ({ code, language }) => {
            console.log(`Executing ${language || 'python'} code...`)
            const result = await codeInterpreter.executeCode({
              code,
              language: language || 'python',
            })
            return result || 'Code executed successfully (no output)'
          },
          {
            name: 'execute_code',
            description:
              'Execute code in a secure sandbox. Supports Python, JavaScript, and TypeScript.',
            schema: z.object({
              code: z.string().describe('Code to execute'),
              language: z
                .enum(['python', 'javascript', 'typescript'])
                .optional()
                .describe('Programming language (default: python)'),
            }),
          },
        )

        const executeCommand = tool(
          async ({ command }) => {
            console.log(`Executing command: ${command}`)
            const result = await codeInterpreter.executeCommand({ command })
            return result || 'Command executed successfully (no output)'
          },
          {
            name: 'execute_command',
            description: 'Execute a shell command in the sandbox.',
            schema: z.object({
              command: z.string().describe('Shell command to execute'),
            }),
          },
        )

        const readFiles = tool(
          async ({ paths }) => {
            const result = await codeInterpreter.readFiles({ paths })
            return result || 'No content'
          },
          {
            name: 'read_files',
            description: 'Read contents of files in the sandbox.',
            schema: z.object({
              paths: z.array(z.string()).describe('List of file paths to read'),
            }),
          },
        )

        const writeFiles = tool(
          async ({ files }) => {
            const result = await codeInterpreter.writeFiles({ files })
            return result || 'Files written successfully'
          },
          {
            name: 'write_files',
            description: 'Write files in the sandbox.',
            schema: z.object({
              files: z
                .array(
                  z.object({
                    path: z.string().describe('File path'),
                    content: z.string().describe('File content'),
                  }),
                )
                .describe('Files to write'),
            }),
          },
        )

        const listFiles = tool(
          async ({ path }) => {
            const result = await codeInterpreter.listFiles({
              path: path || '.',
            })
            return result || 'No files found'
          },
          {
            name: 'list_files',
            description: 'List files in the sandbox directory.',
            schema: z.object({
              path: z
                .string()
                .optional()
                .describe('Directory path (default: current directory)'),
            }),
          },
        )

        const codeTools = [
          executeCode,
          executeCommand,
          readFiles,
          writeFiles,
          listFiles,
        ]

        console.log(
          `Created toolkit with ${codeTools.length} tools: ${codeTools.map((t) => t.name).join(', ')}`,
        )

        // Create the agent with code interpreter tools
        const agent = createAgent({
          model,
          tools: codeTools,
        })

        // Run the agent
        const result = await agent.invoke({
          messages: [{ role: 'user', content: request.prompt }],
        })

        const finalMessage = result.messages[result.messages.length - 1]
        const response = finalMessage.content
        console.log(`Response: ${String(response).substring(0, 200)}...`)

        return JSON.stringify({
          result: response,
          tools_used: codeTools.map((t) => t.name),
          interpreter_type: 'default',
        })
      } catch (err) {
        console.error(`Error: ${err.message}`)
        return JSON.stringify({ error: err.message })
      } finally {
        try {
          await codeInterpreter.stopSession()
          console.log('Code interpreter session stopped')
        } catch {
          // ignore cleanup errors
        }
      }
    },
  },
})

app.run()
