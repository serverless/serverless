#!/usr/bin/env node
/**
 * Test script for the LangGraph Multi-Gateway agents.
 *
 * Usage:
 *   PUBLIC_RUNTIME_ARN=<arn> PRIVATE_RUNTIME_ARN=<arn> node test-invoke.js
 *
 * Or test individually:
 *   RUNTIME_ARN=<arn> AGENT_TYPE=public node test-invoke.js
 *   RUNTIME_ARN=<arn> AGENT_TYPE=private node test-invoke.js
 */

import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore'
import { randomUUID } from 'node:crypto'

const REGION = process.env.AWS_REGION || 'us-east-1'
const PUBLIC_ARN = process.env.PUBLIC_RUNTIME_ARN || process.env.RUNTIME_ARN
const PRIVATE_ARN = process.env.PRIVATE_RUNTIME_ARN || process.env.RUNTIME_ARN
const AGENT_TYPE = process.env.AGENT_TYPE || 'both'

const client = new BedrockAgentCoreClient({ region: REGION })

async function invokeAgent(runtimeArn, inputText, label) {
  const sessionId = randomUUID()
  console.log(`[${label}] Invoking with: '${inputText}'`)
  console.log(`[${label}] Runtime ARN: ${runtimeArn}`)
  console.log(`[${label}] Session ID: ${sessionId}\n`)

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: runtimeArn,
    runtimeSessionId: sessionId,
    payload: Buffer.from(JSON.stringify({ prompt: inputText })),
    contentType: 'application/json',
    accept: 'application/json, text/event-stream',
  })

  const response = await client.send(command)

  console.log(`[${label}] Response:`)
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

  console.log('-'.repeat(50) + '\n')
}

async function main() {
  console.log('LangGraph Multi-Gateway Agent Test Suite')
  console.log('='.repeat(50) + '\n')

  // Test public agent
  if ((AGENT_TYPE === 'both' || AGENT_TYPE === 'public') && PUBLIC_ARN) {
    console.log('Testing Public Agent (calculator via public gateway)\n')
    await invokeAgent(PUBLIC_ARN, 'What is sqrt(144) + 25 * 3?', 'Public')
  }

  // Test private agent
  if ((AGENT_TYPE === 'both' || AGENT_TYPE === 'private') && PRIVATE_ARN) {
    console.log('Testing Private Agent (user lookup via private gateway)\n')
    await invokeAgent(
      PRIVATE_ARN,
      'Look up user USR001 and tell me about them.',
      'Private',
    )
  }

  if (!PUBLIC_ARN && !PRIVATE_ARN) {
    console.error(
      'Error: Set PUBLIC_RUNTIME_ARN and/or PRIVATE_RUNTIME_ARN (or RUNTIME_ARN with AGENT_TYPE).',
    )
    process.exit(1)
  }

  console.log('='.repeat(50))
  console.log('All tests completed!')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
