#!/usr/bin/env node
/**
 * Test script to invoke the MCP Server deployed to AgentCore Runtime.
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

const RUNTIME_ARN = process.env.RUNTIME_ARN
const REGION = process.env.AWS_REGION || 'us-east-1'

if (!RUNTIME_ARN) {
  console.error('Error: RUNTIME_ARN environment variable is required.')
  console.error('Usage: RUNTIME_ARN=<your-runtime-arn> node test-invoke.js')
  console.error('\nGet your runtime ARN from: serverless info')
  process.exit(1)
}

const client = new BedrockAgentCoreClient({ region: REGION })
let sessionId = null

async function invoke(method, params, id) {
  const payload = { jsonrpc: '2.0', method, id }
  if (params) payload.params = params

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: RUNTIME_ARN,
    qualifier: 'DEFAULT',
    ...(sessionId ? { runtimeSessionId: sessionId } : {}),
    payload: Buffer.from(JSON.stringify(payload)),
    contentType: 'application/json',
    accept: 'application/json, text/event-stream',
  })

  const response = await client.send(command)

  // Capture session ID from first response
  if (!sessionId && response.runtimeSessionId) {
    sessionId = response.runtimeSessionId
  }

  // Parse response body
  const body =
    typeof response.response === 'string'
      ? response.response
      : await streamToString(response.response)

  return JSON.parse(body)
}

async function streamToString(stream) {
  if (typeof stream === 'string') return stream
  if (stream instanceof Uint8Array || Buffer.isBuffer(stream)) {
    return new TextDecoder().decode(stream)
  }
  // Handle ReadableStream or async iterator
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
    )
  }
  return chunks.join('')
}

async function testInitialize() {
  console.log('=== Initialize ===')
  const result = await invoke(
    'initialize',
    {
      protocolVersion: '2025-11-25',
      clientInfo: { name: 'test-client', version: '1.0.0' },
      capabilities: {},
    },
    1,
  )
  console.log(
    'Server:',
    result.result?.serverInfo?.name,
    result.result?.serverInfo?.version,
  )
  console.log('Protocol:', result.result?.protocolVersion)
  console.log()
}

async function testListTools() {
  console.log('=== tools/list ===')
  const result = await invoke('tools/list', undefined, 2)
  const tools = result.result?.tools || []
  for (const tool of tools) {
    console.log(`  - ${tool.name}: ${tool.description}`)
  }
  console.log()
}

async function testCallTool(name, args, id) {
  console.log(`=== tools/call: ${name}(${JSON.stringify(args)}) ===`)
  const result = await invoke('tools/call', { name, arguments: args }, id)
  const content =
    result.result?.content?.[0]?.text ?? JSON.stringify(result.result)
  console.log(`  Result: ${content}`)
  console.log()
  return content
}

async function main() {
  console.log('MCP Server Test Suite')
  console.log(`Runtime ARN: ${RUNTIME_ARN}`)
  console.log(`Region: ${REGION}`)
  console.log('='.repeat(50) + '\n')

  // Step 1: Initialize
  await testInitialize()

  // Step 2: Send initialized notification
  const notifPayload = { jsonrpc: '2.0', method: 'notifications/initialized' }
  const notifCommand = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: RUNTIME_ARN,
    qualifier: 'DEFAULT',
    runtimeSessionId: sessionId,
    payload: Buffer.from(JSON.stringify(notifPayload)),
    contentType: 'application/json',
    accept: 'application/json, text/event-stream',
  })
  await client.send(notifCommand)

  // Step 3: List tools
  await testListTools()

  // Step 4: Call each tool
  await testCallTool('add', { a: 5, b: 3 }, 10)
  await testCallTool('multiply', { a: 7, b: 6 }, 11)
  await testCallTool('get_current_time', { timezone: 'UTC' }, 12)
  await testCallTool('get_current_time', { timezone: 'America/New_York' }, 13)

  console.log('='.repeat(50))
  console.log('All tests completed!')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
