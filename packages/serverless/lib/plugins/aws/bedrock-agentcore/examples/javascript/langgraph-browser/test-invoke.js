#!/usr/bin/env node
/**
 * Test script for the LangGraph Browser agent.
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
      console.log(parsed.result || parsed)
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
  console.log('LangGraph Browser Agent Test Suite')
  console.log('='.repeat(50) + '\n')

  console.log('Test 1: Navigate and extract\n')
  await invokeAgent(
    'Navigate to https://example.com and tell me what the page title and main heading say.',
  )

  console.log('='.repeat(50))
  console.log('All tests completed!')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
