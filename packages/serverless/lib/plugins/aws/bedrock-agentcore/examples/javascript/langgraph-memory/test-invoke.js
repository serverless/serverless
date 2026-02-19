#!/usr/bin/env node
/**
 * Test script for the LangGraph Memory agent.
 *
 * Tests conversation persistence by sending multiple messages
 * in the same session and verifying the agent remembers context.
 *
 * Usage:
 *   RUNTIME_ARN=arn:aws:bedrock-agentcore:... node test-invoke.js
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

  console.log('Response received:')
  console.log('-'.repeat(50))

  const body = response.response
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    const chunks = []
    for await (const chunk of body) {
      chunks.push(
        typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
      )
    }
    const text = chunks.join('')
    try {
      const parsed = JSON.parse(text)
      console.log(
        `Result: ${typeof parsed.result === 'string' ? parsed.result.substring(0, 300) : JSON.stringify(parsed.result).substring(0, 300)}`,
      )
      console.log(`Session: ${parsed.session_id}`)
    } catch {
      console.log(text)
    }
  } else if (typeof body === 'string') {
    console.log(body)
  } else {
    console.log(response)
  }

  console.log('-'.repeat(50))
  console.log('Invocation completed!\n')
}

async function main() {
  console.log('LangGraph Memory Agent Test Suite')
  console.log('='.repeat(50) + '\n')

  // Test 1: Initial message
  console.log('Test 1: Initial message (no history)\n')
  await invokeAgent('My name is Alice and I live in Seattle.')

  // Wait a moment for memory to persist
  console.log('Waiting for memory to persist...\n')
  await new Promise((r) => setTimeout(r, 3000))

  console.log('='.repeat(50))

  // Test 2: Follow-up that tests memory
  console.log('\nTest 2: Follow-up (should recall name and city)\n')
  await invokeAgent('What is my name and where do I live?')

  console.log('='.repeat(50))
  console.log('All tests completed!')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
