import os from 'node:os'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { createWorkerThreadRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/worker-thread.js'
import ServerlessError from '../../../../../../../../lib/serverless-error.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpFiles = []

/**
 * Write a temporary .mjs handler file and return its absolute path.
 * The .mjs extension ensures dynamic import() treats it as ESM regardless
 * of the parent package.json "type" field.
 */
async function writeTmpHandler(source) {
  const filePath = path.join(
    os.tmpdir(),
    `worker-thread-test-${crypto.randomUUID()}.mjs`,
  )
  await fs.promises.writeFile(filePath, source, 'utf8')
  tmpFiles.push(filePath)
  return filePath
}

afterAll(async () => {
  await Promise.all(tmpFiles.map((f) => fs.promises.rm(f, { force: true })))
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWorkerThreadRunner', () => {
  let runner

  beforeAll(() => {
    runner = createWorkerThreadRunner({ servicePath: os.tmpdir() })
  })

  // 1. Happy path: async handler returns a value
  it('async handler returns a value', async () => {
    const handlerPath = await writeTmpHandler(
      'export async function handler(event) { return { ok: true, echo: event.x } }',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: { x: 42 },
      context: {},
    })
    expect(result).toEqual({ ok: true, echo: 42 })
  })

  // 2. Sync handler returns a value
  it('sync handler returns a value', async () => {
    const handlerPath = await writeTmpHandler(
      'export function handler(event) { return event.x }',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: { x: 'sync' },
      context: {},
    })
    expect(result).toBe('sync')
  })

  // 3. Handler throws — error propagates with stack
  it('handler throws — error propagates with stack', async () => {
    const handlerPath = await writeTmpHandler(
      "export async function handler() { throw new Error('boom') }",
    )
    await expect(
      runner.invoke({
        handlerPath,
        handlerName: 'handler',
        event: {},
        context: {},
      }),
    ).rejects.toMatchObject({
      message: 'boom',
      stack: expect.stringMatching(/\S/),
    })
  })

  // 4. Environment variables visible inside the worker
  it('environment variables are visible inside the worker', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.FOO',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
      environment: { FOO: 'bar' },
    })
    expect(result).toBe('bar')
  })

  // 5. Lambda context is passed
  it('Lambda context is passed to the handler', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, context) => context.functionName',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { functionName: 'myFn' },
    })
    expect(result).toBe('myFn')
  })

  // 6. Timeout
  it('rejects with ServerlessError OFFLINE_HANDLER_TIMEOUT when the handler exceeds timeoutMs', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = () => new Promise(r => setTimeout(r, 5000))',
    )
    const err = await runner
      .invoke({
        handlerPath,
        handlerName: 'handler',
        event: {},
        context: {},
        timeoutMs: 50,
      })
      .catch((e) => e)

    expect(err).toBeInstanceOf(ServerlessError)
    expect(err.code).toBe('OFFLINE_HANDLER_TIMEOUT')
  })

  // 7. Callback-style handler returns success via callback(null, result)
  it('callback-style handler — success path', async () => {
    const handlerPath = await writeTmpHandler(
      'export function handler(event, context, callback) { callback(null, { ok: true }) }',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    })
    expect(result).toEqual({ ok: true })
  })

  // 8. Callback-style handler returns failure via callback(err)
  it('callback-style handler — failure path', async () => {
    const handlerPath = await writeTmpHandler(
      "export function handler(event, context, callback) { callback(new Error('cb-fail')) }",
    )
    await expect(
      runner.invoke({
        handlerPath,
        handlerName: 'handler',
        event: {},
        context: {},
      }),
    ).rejects.toMatchObject({ message: 'cb-fail' })
  })

  // 9. terminate() is a no-op
  it('terminate() resolves without throwing', async () => {
    await expect(runner.terminate()).resolves.toBeUndefined()
  })
})
