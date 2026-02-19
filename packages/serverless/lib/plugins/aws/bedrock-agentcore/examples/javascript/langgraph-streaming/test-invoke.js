#!/usr/bin/env node
/**
 * Test script to invoke the LangGraph streaming agent deployed to AgentCore Runtime.
 *
 * This script handles SSE (Server-Sent Events) streaming responses,
 * printing each token as it arrives for real-time output.
 *
 * Usage:
 *   RUNTIME_ARN=arn:aws:bedrock-agentcore:... node test-invoke.js
 *
 * Or set RUNTIME_ARN environment variable before running.
 *
 * Requires: @aws-sdk/client-bedrock-agentcore
 *   npm install @aws-sdk/client-bedrock-agentcore
 */

import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore'
import { randomUUID } from 'node:crypto'

const RUNTIME_ARN = process.env.RUNTIME_ARN
const REGION = process.env.AWS_REGION || 'us-east-1'
const SESSION_ID = randomUUID()

if (!RUNTIME_ARN) {
  console.error('Error: RUNTIME_ARN environment variable is required.')
  console.error('Usage: RUNTIME_ARN=<your-runtime-arn> node test-invoke.js')
  console.error('\nGet your runtime ARN from: serverless info')
  process.exit(1)
}

const client = new BedrockAgentCoreClient({ region: REGION })

async function invokeAgent(inputText) {
  console.log(`Invoking agent with input: '${inputText}'`)
  console.log(`Runtime ARN: ${RUNTIME_ARN}`)
  console.log(`Session ID: ${SESSION_ID}\n`)

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: RUNTIME_ARN,
    runtimeSessionId: SESSION_ID,
    payload: Buffer.from(JSON.stringify({ prompt: inputText })),
    contentType: 'application/json',
    accept: 'application/json, text/event-stream',
  })

  const response = await client.send(command)

  console.log('Response received (streaming):')
  console.log('-'.repeat(50))

  const contentType = response.contentType || ''
  const body = response.response

  if (contentType.includes('text/event-stream')) {
    /**
     * Handle SSE streaming response.
     * Each chunk is an SSE-formatted data line: "data: ...\n\n"
     */
    const chunks = []
    for await (const chunk of body) {
      const text =
        typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)

      /**
       * Parse SSE lines and extract data payloads
       */
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data)
              if (typeof parsed === 'string') {
                process.stdout.write(parsed)
                chunks.push(parsed)
              } else if (parsed.text) {
                process.stdout.write(parsed.text)
                chunks.push(parsed.text)
              } else if (parsed.data?.text) {
                process.stdout.write(parsed.data.text)
                chunks.push(parsed.data.text)
              }
            } catch {
              /**
               * Not JSON — treat as plain text chunk
               */
              process.stdout.write(data)
              chunks.push(data)
            }
          }
        }
      }
    }
    console.log('\n')
  } else if (typeof body === 'string') {
    console.log(body)
  } else if (body && typeof body[Symbol.asyncIterator] === 'function') {
    const chunks = []
    for await (const chunk of body) {
      chunks.push(
        typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
      )
    }
    const text = chunks.join('')
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2))
    } catch {
      console.log(text)
    }
  } else if (body && typeof body.read === 'function') {
    const data = await body.read()
    const text = new TextDecoder().decode(data)
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2))
    } catch {
      console.log(text)
    }
  } else {
    console.log(response)
  }

  console.log('-'.repeat(50))
  console.log('Invocation completed!\n')
}

async function main() {
  console.log('LangGraph Streaming Agent Test Suite')
  console.log('='.repeat(50) + '\n')

  /**
   * Test 1: Simple calculation — triggers tool use, then streams the response
   */
  console.log('Test 1: Calculator (with tool call + streamed response)\n')
  await invokeAgent('What is 25 multiplied by 4?')

  console.log('='.repeat(50))

  /**
   * Test 2: Conversational — streams tokens directly without tool calls
   */
  console.log('\nTest 2: Conversational (pure streamed text)\n')
  await invokeAgent('Write a short haiku about streaming data in real time.')

  console.log('='.repeat(50))

  /**
   * Test 3: Time query — tool call followed by streamed explanation
   */
  console.log('\nTest 3: Time query (tool call + streamed response)\n')
  await invokeAgent('What is the current time in New York?')

  console.log('='.repeat(50))
  console.log('All tests completed!')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
