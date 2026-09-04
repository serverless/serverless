import { describe, it, expect, beforeAll } from '@jest/globals'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { default: LocalLambda } =
  await import('../../../../../../lib/plugins/aws/dev/local-lambda/index.js')
const { mcpEntrySourcePath } =
  await import('../../../../../../lib/plugins/aws/mcp/lib/packaging.js')
const { buildMcpEntry } =
  await import('../../../../../../scripts/build-mcp-entry.js')

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
)

describe('LocalLambda with an explicit handler location', () => {
  it('bypasses service-dir resolution', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: '/nonexistent/service',
      handler: 'src/server.default',
      handlerFileAbsolutePath: '/also/nonexistent/entry.mjs',
      handlerName: 'bufferedHandler',
      runtime: 'nodejs22.x',
      environment: {},
      invocationColorFn: (s) => s,
    })

    // Resolution against /nonexistent would throw DEV_MODE_HANDLER_NOT_FOUND;
    // the override must not consult the service dir at all.
    await expect(localLambda.getHandlerFileAbsolutePath()).resolves.toBe(
      '/also/nonexistent/entry.mjs',
    )
  })
})

describe('invoking an MCP server locally through the prebuilt entry', () => {
  // The entry bundle is a build product, and the unit suite cannot assume a
  // developer or CI leg has built it. Building only when it is absent leaves a
  // developer's own bundle untouched.
  beforeAll(async () => {
    if (!existsSync(mcpEntrySourcePath)) await buildMcpEntry()
  }, 120000)

  it('answers the fixture module response through the buffered door', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: fixturesDir,
      handler: 'mcp-server.default',
      handlerFileAbsolutePath: mcpEntrySourcePath,
      handlerName: 'bufferedHandler',
      runtime: 'nodejs22.x',
      environment: {
        SERVERLESS_MCP_SERVER_MODULE: 'mcp-server.mjs',
        LAMBDA_TASK_ROOT: fixturesDir,
      },
      invocationColorFn: (s) => s,
    })

    const result = await localLambda.invoke(
      {
        httpMethod: 'POST',
        path: '/x/mcp',
        headers: { 'content-type': 'application/json' },
        requestContext: {
          httpMethod: 'POST',
          domainName: 'localhost',
          path: '/x/mcp',
          stage: 'dev',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 }),
        isBase64Encoded: false,
      },
      { awsRequestId: 'test', timeout: 6 },
    )

    expect(result.error).toBeNull()
    expect(result.response.statusCode).toBe(200)
    // Textual, not base64: the buffered door keeps SSE out of the base64
    // inflation that the dev tunnel's payload cap cannot afford.
    expect(String(result.response.body)).toContain('"ok":true')
  }, 30000)
})
