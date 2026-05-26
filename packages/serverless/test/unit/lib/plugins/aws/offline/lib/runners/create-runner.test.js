import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/create-runner.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const PYTHON_FIXTURES = path.resolve(here, '../../__fixtures__/handlers/python')

describe('createRunner — runtime-aware dispatch', () => {
  it('routes nodejs* runtime to the worker-thread runner by default', async () => {
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
    })
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sls-offline-dispatch-'),
    )
    const handler = path.join(tmp, 'h.mjs')
    await fs.writeFile(
      handler,
      'export const handler = () => ({ from: "node" })\n',
    )
    try {
      const result = await r.invoke({
        functionKey: 'node-fn',
        handlerPath: handler,
        handlerName: 'handler',
        event: {},
        context: {},
        runtime: 'nodejs20.x',
      })
      expect(result).toEqual({ from: 'node' })
    } finally {
      await r.terminate()
    }
  })

  it('routes python* runtime to the Python child-process runner', async () => {
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
    })
    try {
      const result = await r.invoke({
        functionKey: 'py-fn',
        handlerPath: path.join(PYTHON_FIXTURES, 'sync_echo.py'),
        handlerName: 'handler',
        event: { hi: 1 },
        context: { name: 'py-fn' },
        runtime: 'python3.11',
      })
      expect(result).toEqual({ ok: true, echo: { hi: 1 }, fn: 'py-fn' })
    } finally {
      await r.terminate()
    }
  })

  it('routes useInProcess to in-process Node runner', async () => {
    const r = createRunner({
      useInProcess: true,
      terminateIdleLambdaTime: 60,
    })
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sls-offline-dispatch-'),
    )
    const handler = path.join(tmp, 'h.mjs')
    await fs.writeFile(
      handler,
      'export const handler = () => ({ from: "in-process" })\n',
    )
    try {
      const result = await r.invoke({
        functionKey: 'inproc-fn',
        handlerPath: handler,
        handlerName: 'handler',
        event: {},
        context: {},
        runtime: 'nodejs20.x',
      })
      expect(result).toEqual({ from: 'in-process' })
    } finally {
      await r.terminate()
    }
  })

  it('python runtime takes precedence over useInProcess flag', async () => {
    // useInProcess: true would route Node to in-process, but a Python
    // function must still go to the Python runner.
    const r = createRunner({
      useInProcess: true,
      terminateIdleLambdaTime: 60,
    })
    try {
      const result = await r.invoke({
        functionKey: 'py-fn-2',
        handlerPath: path.join(PYTHON_FIXTURES, 'sync_echo.py'),
        handlerName: 'handler',
        event: { ok: 'maybe' },
        context: { name: 'py-fn-2' },
        runtime: 'python3.12',
      })
      expect(result).toEqual({
        ok: true,
        echo: { ok: 'maybe' },
        fn: 'py-fn-2',
      })
    } finally {
      await r.terminate()
    }
  })

  it('terminate() shuts down all sub-runners (idempotent no-op when none created)', async () => {
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
    })
    // No sub-runners yet — must be a no-op, not throw.
    await r.terminate()
    // Idempotent.
    await r.terminate()
  })

  it('accepts new invokes after terminate() (sub-runners are re-created lazily)', async () => {
    const r = createRunner({
      useInProcess: true,
      terminateIdleLambdaTime: 60,
    })
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sls-offline-dispatch-'),
    )
    const handler = path.join(tmp, 'h.mjs')
    await fs.writeFile(
      handler,
      'export const handler = () => ({ tag: "post-terminate" })\n',
    )
    try {
      await r.invoke({
        functionKey: 'fn',
        handlerPath: handler,
        handlerName: 'handler',
        event: {},
        context: {},
        runtime: 'nodejs20.x',
      })
      await r.terminate()
      const result = await r.invoke({
        functionKey: 'fn',
        handlerPath: handler,
        handlerName: 'handler',
        event: {},
        context: {},
        runtime: 'nodejs20.x',
      })
      expect(result).toEqual({ tag: 'post-terminate' })
    } finally {
      await r.terminate()
    }
  })
})
