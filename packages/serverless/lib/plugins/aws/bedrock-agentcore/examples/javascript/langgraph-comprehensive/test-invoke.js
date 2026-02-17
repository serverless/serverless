#!/usr/bin/env node
/**
 * Test script for the LangGraph Comprehensive agent.
 *
 * Exercises each tool type individually, then a combined scenario.
 * Supports both JSON and SSE (streaming) response formats.
 *
 * Usage:
 *   RUNTIME_ARN=arn:aws:bedrock-agentcore:... node test-invoke.js
 *
 * Or test individual tools:
 *   RUNTIME_ARN=<arn> node test-invoke.js calculator
 *   RUNTIME_ARN=<arn> node test-invoke.js knowledge
 *   RUNTIME_ARN=<arn> node test-invoke.js browser
 *   RUNTIME_ARN=<arn> node test-invoke.js code
 *   RUNTIME_ARN=<arn> node test-invoke.js memory
 *   RUNTIME_ARN=<arn> node test-invoke.js combined
 */

import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore'
import { randomUUID } from 'node:crypto'

const RUNTIME_ARN = process.env.RUNTIME_ARN
const REGION = process.env.AWS_REGION || 'us-east-1'

if (!RUNTIME_ARN) {
  console.error('Error: RUNTIME_ARN environment variable is required.')
  console.error('Usage: RUNTIME_ARN=<your-runtime-arn> node test-invoke.js')
  console.error('\nGet your runtime ARN from: serverless info')
  process.exit(1)
}

const client = new BedrockAgentCoreClient({ region: REGION })

/**
 * Decode the raw response stream from the SDK into a text string.
 * Handles Buffer, Uint8Array, and nested { chunk: { bytes } } shapes.
 */
async function readResponseStream(responseStream) {
  const decoder = new TextDecoder()
  let raw = ''

  for await (const chunk of responseStream) {
    if (typeof chunk === 'string') {
      raw += chunk
    } else if (chunk instanceof Uint8Array || Buffer.isBuffer(chunk)) {
      raw += decoder.decode(chunk, { stream: true })
    } else if (chunk?.chunk?.bytes) {
      raw += decoder.decode(chunk.chunk.bytes, { stream: true })
    } else if (chunk?.bytes) {
      raw += decoder.decode(chunk.bytes, { stream: true })
    }
  }

  raw += decoder.decode()
  return raw
}

/**
 * Extract the human-readable response text from whatever format the API returns.
 * Tries JSON first (most common for deployed agents), then SSE, then raw text.
 */
function extractResponse(raw, contentType) {
  /**
   * SSE format: the runtime may return text/event-stream when the agent
   * takes long enough for the SSE heartbeat to fire (>30s).
   */
  if (contentType?.includes('text/event-stream')) {
    const lines = raw.split('\n')
    const parts = []

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trimStart()
      if (!data || data === '[DONE]') continue
      parts.push(data)
    }

    return parts.join('') || null
  }

  /** JSON format: { result: "...", session_id: "..." } */
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.result === 'string') return parsed.result
    if (typeof parsed.error === 'string') return `ERROR: ${parsed.error}`
    return JSON.stringify(parsed, null, 2)
  } catch {
    /** Fallback: return raw text */
  }

  return raw || null
}

async function invokeAgent(inputText, sessionId) {
  console.log(`\n  Prompt: ${inputText}`)

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: RUNTIME_ARN,
    runtimeSessionId: sessionId,
    payload: Buffer.from(JSON.stringify({ prompt: inputText })),
    contentType: 'application/json',
    /** Prefer SSE so the runtime streams when possible */
    accept: 'text/event-stream, application/json',
  })

  const start = Date.now()
  const response = await client.send(command)
  const contentType = response.contentType || ''

  const body = response.response
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') {
    console.log('  Response: (no iterable body)')
    return
  }

  const raw = await readResponseStream(body)
  const text = extractResponse(raw, contentType)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  if (text) {
    /** Truncate very long responses for readability */
    const display = text.length > 500 ? text.substring(0, 500) + '...' : text
    console.log(`  Response (${elapsed}s): ${display}`)
  } else {
    console.log(`  Response (${elapsed}s): (empty)`)
    console.log(`  Content-Type: ${contentType}`)
    console.log(`  Raw (first 200): ${raw.substring(0, 200)}`)
  }
}

/** Test definitions */
const tests = {
  calculator: {
    label: 'Calculator (Lambda function tool via Gateway)',
    prompt: 'What is sqrt(144) + 25 * 3?',
  },
  knowledge: {
    label: 'AWS Knowledge (direct MCP connection)',
    prompt:
      'Use the AWS Knowledge tools to briefly explain what Amazon DynamoDB is in 2-3 sentences.',
  },
  browser: {
    label: 'Browser (web automation)',
    prompt:
      'Navigate to https://www.serverless.com/framework/docs and tell me what the main heading says.',
  },
  code: {
    label: 'Code Interpreter (sandboxed execution)',
    prompt:
      'Write and execute Python code to compute the sum of squares from 1 to 100.',
  },
  memory: {
    label: 'Memory (conversation persistence)',
    needsSeparateSession: true,
    steps: [
      {
        sublabel: 'store',
        prompt:
          'My name is Alice and my favorite programming language is Rust. Please remember this.',
      },
      {
        sublabel: 'recall',
        prompt:
          'Can you recall what my name is and what my favorite programming language is?',
        delayBefore: 3000,
      },
    ],
  },
  combined: {
    label: 'Combined (multiple tools in one query)',
    prompt:
      'Use the calculator to compute 1000000 * 0.0000002 * 0.125, which represents the cost of 1 million Lambda invocations at 128MB for 200ms.',
  },
}

async function runTest(name, sessionId) {
  const test = tests[name]
  if (!test) {
    console.error(`Unknown test: ${name}`)
    return false
  }

  console.log(`\n[${name}] ${test.label}`)
  console.log('-'.repeat(60))

  try {
    if (test.steps) {
      const sid = test.needsSeparateSession
        ? `test-memory-${randomUUID()}`
        : sessionId

      for (const step of test.steps) {
        if (step.delayBefore) {
          console.log(
            `\n  (waiting ${step.delayBefore / 1000}s for persistence...)`,
          )
          await new Promise((r) => setTimeout(r, step.delayBefore))
        }
        if (step.sublabel) console.log(`  [${step.sublabel}]`)
        await invokeAgent(step.prompt, sid)
      }
    } else {
      await invokeAgent(test.prompt, sessionId)
    }

    console.log('-'.repeat(60))
    return true
  } catch (err) {
    console.error(`  FAILED: ${err.message}`)
    console.log('-'.repeat(60))
    return false
  }
}

async function main() {
  const filter = process.argv[2]

  console.log('LangGraph Comprehensive Agent -- Test Suite')
  console.log('='.repeat(60))
  console.log(`Runtime: ${RUNTIME_ARN}`)
  console.log(`Region:  ${REGION}`)

  const sessionId = `test-comprehensive-${randomUUID()}`
  const testNames = filter ? [filter] : Object.keys(tests)

  let passed = 0
  let failed = 0

  for (const name of testNames) {
    const ok = await runTest(name, sessionId)
    if (ok) passed++
    else failed++
  }

  console.log('\n' + '='.repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
