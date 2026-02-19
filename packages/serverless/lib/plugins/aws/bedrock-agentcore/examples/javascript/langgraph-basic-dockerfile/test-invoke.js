#!/usr/bin/env node
/**
 * Test script to invoke the LangGraph agent deployed to AgentCore Runtime.
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

  console.log('Response received:')
  console.log('-'.repeat(50))

  const contentType = response.contentType || ''
  const body = response.response

  if (contentType.includes('text/event-stream')) {
    const chunks = []
    for await (const chunk of body) {
      const text =
        typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
      process.stdout.write(text)
      chunks.push(text)
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
  console.log('LangGraph Agent Test Suite')
  console.log('='.repeat(50) + '\n')

  // Test 1: Simple calculation
  console.log('Test 1: Calculator\n')
  await invokeAgent('What is 25 multiplied by 4?')

  console.log('='.repeat(50))

  // Test 2: Time query
  console.log('\nTest 2: Time query\n')
  await invokeAgent('What is the current time?')

  console.log('='.repeat(50))
  console.log('All tests completed!')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
