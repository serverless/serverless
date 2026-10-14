import { afterEach, describe, expect, jest, test } from '@jest/globals'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import {
  WORKER_IDLE_MS,
  createLocalRuntime,
} from '../../../../../../../lib/plugins/aws/dev/local/runtime.js'
import { MAX_WORKERS } from '../../../../../../../lib/plugins/aws/dev/local/worker-pool.js'
import { REPLAY_ENVIRONMENT_ID } from '../../../../../../../lib/plugins/aws/dev/local/replay.js'
import { nodeAdapter } from '../../../../../../../lib/plugins/aws/dev/local/adapters/node.js'
import { pythonAdapter } from '../../../../../../../lib/plugins/aws/dev/local/adapters/python.js'
import {
  DEADLINE_GRACE_MS,
  STREAM_HEAD_BYTES,
} from '../../../../../../../lib/plugins/aws/dev/local/dispatch.js'
import { MAX_REMAINING_MS } from '../../../../../../../lib/plugins/aws/dev/relay/clock.js'
import { countingTimers } from '../attach/fakes.js'
import {
  alive,
  baseEnv,
  cleanTempDirs,
  collect,
  invocation,
  sleep,
  pythonCommand,
  tempDir,
  waitFor,
  write,
} from './helpers.js'

jest.setTimeout(60_000)

const FUNCTION_ROLE = {
  AWS_ACCESS_KEY_ID: 'ASIAFUNCTIONROLE0001',
  AWS_SECRET_ACCESS_KEY: 'function-secret',
  AWS_SESSION_TOKEN: 'function-token',
}
const deployedEnv = (over = {}) => ({
  AWS_REGION: 'us-east-1',
  AWS_LAMBDA_FUNCTION_NAME: 'svc-dev-api',
  AWS_LAMBDA_FUNCTION_MEMORY_SIZE: '1024',
  GREETING: 'deployed',
  ...FUNCTION_ROLE,
  ...over,
})
const HANDLER = (version) =>
  [
    'let count = 0',
    'export const handler = async (event) => {',
    '  count += 1',
    '  if (event.exit) process.exit(event.exit)',
    '  if (event.sleepMs) await new Promise((resolve) => setTimeout(resolve, event.sleepMs))',
    '  if (event.log) console.log(event.log)',
    '  let credentials = null',
    '  if (event.credentials) {',
    '    const response = await fetch(process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI, {',
    '      headers: { Authorization: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN },',
    '    })',
    '    credentials = (await response.json()).AccessKeyId',
    '  }',
    '  return {',
    `    version: '${version}',`,
    '    count,',
    '    pid: process.pid,',
    '    greeting: process.env.GREETING,',
    '    profile: process.env.AWS_PROFILE ?? null,',
    '    tz: process.env.TZ,',
    '    credentials,',
    "    devVariables: Object.keys(process.env).filter((name) => name.startsWith('SLS_DEV_')),",
    '    execWrapper: process.env.AWS_LAMBDA_EXEC_WRAPPER ?? null,',
    "    metadataEndpoint: ['AWS_LAMBDA_METADATA_API', 'AWS_LAMBDA_METADATA_TOKEN'].filter(",
    '      (name) => name in process.env,',
    '    ),',
    "    staticKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'].filter(",
    '      (name) => name in process.env,',
    '    ),',
    '    credentialsEndpoint: Boolean(',
    '      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI &&',
    '        process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN,',
    '    ),',
    '  }',
    '}',
    '',
  ].join('\n')
const STREAMING_HANDLER = [
  'export const handler = awslambda.streamifyResponse(async (event, responseStream) => {',
  "  responseStream.write('a')",
  '  await new Promise((resolve) => setTimeout(resolve, 200))',
  "  responseStream.write('b')",
  '  responseStream.end()',
  '})',
  '',
].join('\n')

// 1.5 MiB in 64 KiB chunks: more than a stream's end keeps.
const LARGE_STREAMING_HANDLER = [
  'export const handler = awslambda.streamifyResponse(async (event, responseStream) => {',
  '  for (let i = 0; i < 24; i += 1) responseStream.write(Buffer.alloc(65536, 120))',
  '  responseStream.end()',
  '})',
  '',
].join('\n')

const PRELUDE_STREAMING_HANDLER = [
  'export const handler = awslambda.streamifyResponse(async (event, responseStream) => {',
  '  const stream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 200 })',
  "  for (const text of ['a', 'b', 'c']) {",
  '    stream.write(text)',
  '    await new Promise((resolve) => setTimeout(resolve, 150))',
  '  }',
  '  stream.end()',
  '})',
  '',
].join('\n')

const fakeOutput = () => {
  const calls = []
  const at = (kind) => (args) => calls.push({ kind, ...args })
  return {
    calls,
    of: (kind) => calls.filter((call) => call.kind === kind),
    start: at('start'),
    log: at('log'),
    end: at('end'),
    workerExited: at('workerExited'),
  }
}
const throwingOutput = () => {
  const boom = (name) => () => {
    throw new Error(`${name} broke`)
  }
  return {
    start: boom('start'),
    log: boom('log'),
    end: boom('end'),
    workerExited: boom('workerExited'),
  }
}
const quietLogger = () => {
  const lines = []
  return {
    lines,
    debug: (text) => lines.push(['debug', text]),
    warning: (text) => lines.push(['warning', text]),
    notice: (text) => lines.push(['notice', text]),
  }
}

/** An adapter that waits for `release()` before it prepares, and records every child it starts. */
const gatedAdapter = () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const children = []
  return {
    children,
    release: () => release(),
    adapter: {
      ...nodeAdapter,
      prepare: async (options) => {
        await gate
        return nodeAdapter.prepare(options)
      },
      start: (options) => {
        const child = nodeAdapter.start(options)
        children.push(child)
        return child
      },
    },
  }
}

const started = []
afterEach(async () => {
  for (const entry of started.splice(0)) {
    await entry.runtime.stop()
    expect(entry.timers.live()).toBe(0)
  }
  cleanTempDirs()
})

const setup = async ({
  files = { 'handler.mjs': HANDLER('v1') },
  timeout = 6,
  idleMs,
  output = fakeOutput(),
  adapter = nodeAdapter,
  machineEnv = {},
  timers = countingTimers(),
  tmpRoot = tempDir('sls-dev-tmp-'),
  now,
  isBuilt,
  builtFile,
  maxWorkers,
  local = {
    available: true,
    command: process.execPath,
    version: process.versions.node,
  },
  deployedRuntime = 'nodejs24.x',
  // The function's deployed configuration, which a handler runs with.
  deployedVariables = { GREETING: 'deployed' },
} = {}) => {
  const serviceDir = write(tempDir(), files)
  const processRef = new EventEmitter()
  const logger = quietLogger()
  const functions = new Map([
    [
      'api',
      {
        key: 'api',
        adapter,
        local,
        runtime: deployedRuntime,
        timeout,
        config: { handler: 'handler.handler' },
        deployedVariables,
        lambdaValues: {
          AWS_REGION: 'us-east-1',
          AWS_DEFAULT_REGION: 'us-east-1',
          AWS_LAMBDA_FUNCTION_NAME: 'svc-dev-api',
          AWS_LAMBDA_FUNCTION_MEMORY_SIZE: '1024',
        },
      },
    ],
  ])
  const runtime = createLocalRuntime({
    serverless: { pluginManager: { plugins: [] } },
    serviceDir,
    functions,
    output,
    logger,
    timers,
    processRef,
    machineEnv: {
      ...baseEnv(),
      HOME: serviceDir,
      AWS_PROFILE: 'developer',
      ...machineEnv,
    },
    tmpRoot,
    ...(idleMs !== undefined && { idleMs }),
    ...(now && { now }),
    ...(isBuilt && { isBuilt }),
    ...(builtFile && { builtFile }),
    ...(maxWorkers !== undefined && { maxWorkers }),
  })
  await runtime.start()
  const entry = {
    runtime,
    timers,
    output,
    logger,
    processRef,
    serviceDir,
    tmpRoot,
  }
  started.push(entry)
  const send = ({
    environmentId = 'env-1',
    environment = deployedEnv(),
    functionKey = 'api',
    ...options
  } = {}) =>
    runtime.invoke({
      functionKey,
      environmentId,
      environment,
      ...invocation(options),
    })
  const invoke = async (options) => collect(await send(options))
  return { ...entry, send, invoke }
}
const body = (reply) => JSON.parse(reply.text)

describe('the laptop runtime', () => {
  test('the first invocation starts a worker; the next one of that environment reuses it; another environment gets its own', async () => {
    const { invoke, output, runtime } = await setup()
    const first = body(await invoke({ environmentId: 'env-1' }))
    const second = body(await invoke({ environmentId: 'env-1' }))
    const other = body(await invoke({ environmentId: 'env-2' }))
    expect([first.count, second.count, other.count]).toEqual([1, 2, 1])
    expect(second.pid).toBe(first.pid)
    expect(other.pid).not.toBe(first.pid)
    expect(output.of('start').map((call) => call.newWorker)).toEqual([
      true,
      false,
      true,
    ])
    expect(output.of('end')[0].initMs).toEqual(expect.any(Number))
    expect(output.of('end')[1].initMs).toBeUndefined()
    expect(runtime.workerCount()).toBe(2)
  })

  test('a worker is prepared to run the build output only once a dev build built its function', async () => {
    const built = new Set()
    const seen = []
    const recording = {
      ...nodeAdapter,
      prepare: async (options) => {
        seen.push(options.built)
        // This service has no build output: the handler runs from its source either way.
        return nodeAdapter.prepare({ ...options, built: false })
      },
    }
    const { invoke, runtime } = await setup({
      adapter: recording,
      isBuilt: (key) => built.has(key),
    })
    expect(body(await invoke()).count).toBe(1)
    built.add('api')
    runtime.reload(['api'])
    expect(body(await invoke()).count).toBe(1)
    expect(seen).toEqual([false, true])
  })

  test('a worker of a built function is prepared with the handler file the build named', async () => {
    const seen = []
    const recording = {
      ...nodeAdapter,
      prepare: async (options) => {
        seen.push([options.built, options.builtFile])
        return nodeAdapter.prepare({ ...options, built: false })
      },
    }
    const { invoke } = await setup({
      adapter: recording,
      isBuilt: () => true,
      builtFile: (key) => (key === 'api' ? 'src/api.mjs' : null),
    })
    expect(body(await invoke()).count).toBe(1)
    expect(seen).toEqual([[true, 'src/api.mjs']])
  })

  test("the handler process sees the deployed environment and none of Dev Mode's variables or Lambda's metadata endpoint", async () => {
    const lambdaSet = {
      SLS_DEV_SESSION: 's_1',
      SLS_DEV_SESSION_KEY: 'secret-key',
      SLS_DEV_REAL_RUNTIME_API: '169.254.100.1:9001',
      AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
      AWS_LAMBDA_METADATA_API: '169.254.100.1:9001',
      AWS_LAMBDA_METADATA_TOKEN: 'token-of-the-execution-environment',
    }
    const { invoke, logger } = await setup({
      deployedVariables: {
        GREETING: 'deployed',
        NODE_OPTIONS: '--require /opt/sls-sdk-node/index.js',
        ...lambdaSet,
      },
    })
    const seen = body(
      await invoke({
        event: { credentials: true },
        environment: deployedEnv(lambdaSet),
      }),
    )
    expect(seen).toMatchObject({
      greeting: 'deployed',
      profile: null,
      tz: 'UTC',
      credentials: 'ASIAFUNCTIONROLE0001',
      devVariables: [],
      execWrapper: null,
      metadataEndpoint: [],
    })
    expect(logger.lines).toContainEqual([
      'debug',
      'Dev Mode applies only the runtime settings and the service directory preloads of the NODE_OPTIONS of api on this machine; left out: --require',
    ])
  })

  test("a Node.js handler process gets this machine's path, home and locale, and no other variable of the shell", async () => {
    const { invoke } = await setup({
      files: {
        'handler.mjs':
          'export const handler = async () => ({ env: process.env })\n',
      },
      machineEnv: {
        LANG: 'en_US.UTF-8',
        SERVERLESS_ACCESS_KEY: 'access-key-secret',
        NPM_TOKEN: 'npm-secret',
      },
      deployedVariables: { NPM_TOKEN: 'deployed' },
    })
    const { env } = body(await invoke())
    expect(env).toMatchObject({ LANG: 'en_US.UTF-8', NPM_TOKEN: 'deployed' })
    expect(env.PATH).toEqual(expect.any(String))
    expect(env.HOME).toEqual(expect.any(String))
    expect(env).not.toHaveProperty('SERVERLESS_ACCESS_KEY')
  })

  const python = pythonCommand()
  ;(python ? test : test.skip)(
    "a Python handler process gets this machine's path, home and locale, and no other variable of the shell",
    async () => {
      const { invoke } = await setup({
        adapter: pythonAdapter,
        local: { available: true, command: python, version: '3' },
        deployedRuntime: 'python3.13',
        files: {
          'handler.py':
            'import os\n\ndef handler(event, context):\n    return {"env": dict(os.environ)}\n',
        },
        machineEnv: {
          LANG: 'en_US.UTF-8',
          SERVERLESS_ACCESS_KEY: 'access-key-secret',
          NPM_TOKEN: 'npm-secret',
        },
        deployedVariables: { NPM_TOKEN: 'deployed' },
      })
      const { env } = body(await invoke())
      expect(env).toMatchObject({ LANG: 'en_US.UTF-8', NPM_TOKEN: 'deployed' })
      expect(env.PATH).toEqual(expect.any(String))
      expect(env).not.toHaveProperty('SERVERLESS_ACCESS_KEY')
    },
  )

  test('code named in the deployed NODE_OPTIONS never runs in the handler process', async () => {
    const serviceDir = tempDir()
    const marker = path.join(serviceDir, 'preloaded')
    const preload = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'x')`
    const { invoke, logger } = await setup({
      deployedVariables: {
        GREETING: 'deployed',
        NODE_OPTIONS: `--import=data:text/javascript;base64,${Buffer.from(preload).toString('base64')} --max-old-space-size=256`,
      },
    })
    const seen = body(await invoke())
    expect(seen.greeting).toBe('deployed')
    expect(fs.existsSync(marker)).toBe(false)
    const lines = logger.lines.map(([, text]) => text).join('\n')
    expect(lines).toContain('left out: --import')
    expect(lines).not.toContain('base64')
  })

  test('a preload from the service directory named in the deployed NODE_OPTIONS runs before the handler', async () => {
    const { invoke, logger } = await setup({
      files: {
        'preload.cjs': "globalThis.preloaded = 'by --require'",
        'with space/preload.mjs': "globalThis.imported = 'by --import'",
        'handler.mjs': [
          'export const handler = async () => ({',
          '  preloaded: globalThis.preloaded ?? null,',
          '  imported: globalThis.imported ?? null,',
          '})',
          '',
        ].join('\n'),
      },
      deployedVariables: {
        NODE_OPTIONS:
          '--require ./preload.cjs --import "./with space/preload.mjs" --require /opt/nodejs/node_modules/otel/register.js',
      },
    })
    const seen = body(await invoke())
    expect(seen).toEqual({ preloaded: 'by --require', imported: 'by --import' })
    expect(logger.lines).toContainEqual([
      'debug',
      'Dev Mode applies only the runtime settings and the service directory preloads of the NODE_OPTIONS of api on this machine; left out: --require',
    ])
  })

  test("the developer's own AWS keys never reach the handler, which gets the function's role from the credentials endpoint", async () => {
    const { invoke } = await setup({
      machineEnv: {
        AWS_ACCESS_KEY_ID: 'AKIADEVELOPER0000001',
        AWS_SECRET_ACCESS_KEY: 'developer-secret',
        AWS_SESSION_TOKEN: 'developer-token',
      },
    })
    expect(body(await invoke({ event: { credentials: true } }))).toMatchObject({
      staticKeys: [],
      credentialsEndpoint: true,
      credentials: 'ASIAFUNCTIONROLE0001',
      profile: null,
    })
  })

  test('credentials refresh when a later invocation brings new ones', async () => {
    const { invoke } = await setup()
    expect(
      body(await invoke({ event: { credentials: true } })).credentials,
    ).toBe('ASIAFUNCTIONROLE0001')
    const refreshed = deployedEnv({ AWS_ACCESS_KEY_ID: 'ASIAFUNCTIONROLE0002' })
    expect(
      body(
        await invoke({ event: { credentials: true }, environment: refreshed }),
      ).credentials,
    ).toBe('ASIAFUNCTIONROLE0002')
  })

  describe('what an invocation brings', () => {
    const ENV_HANDLER = [
      'export const handler = async () => {',
      '  const response = await fetch(process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI, {',
      '    headers: { Authorization: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN },',
      '  })',
      '  return { env: process.env, role: (await response.json()).AccessKeyId }',
      '}',
      '',
    ].join('\n')
    // What any holder of the session key could put in an invocation of this function.
    const FORGED = {
      SHELLOPTS: 'xtrace',
      PS4: '$(touch /tmp/forged)',
      'BASH_FUNC_ls%%': '() { touch /tmp/forged; }',
      PYTHONWARNINGS: 'ignore::scripts.reset_db.X',
      NODE_OPTIONS: '--require ./forged.cjs',
      AWS_ENDPOINT_URL: 'https://forged.example',
      GIT_SSH_COMMAND: 'touch /tmp/forged',
      GREETING: 'forged',
      AWS_REGION: 'eu-west-1',
    }

    test('sets no variable of its own: the handler runs with the deployed configuration', async () => {
      const { invoke, logger } = await setup({
        files: {
          'handler.mjs': ENV_HANDLER,
          'forged.cjs': 'globalThis.forged = true\n',
        },
        deployedVariables: {
          GREETING: 'deployed',
          AWS_ENDPOINT_URL: 'https://deployed.example',
        },
      })
      const { env, role } = body(
        await invoke({
          environment: deployedEnv({
            ...FORGED,
            AWS_LAMBDA_LOG_STREAM_NAME: '2026/10/13/[$LATEST]abc',
            _X_AMZN_TRACE_ID: 'Root=1-abc',
          }),
        }),
      )
      for (const name of [
        'SHELLOPTS',
        'PS4',
        'BASH_FUNC_ls%%',
        'PYTHONWARNINGS',
        'GIT_SSH_COMMAND',
      ]) {
        expect(env).not.toHaveProperty([name])
      }
      // Only the runtime's own flag: nothing of the invocation's NODE_OPTIONS.
      expect(env.NODE_OPTIONS).toBe('--enable-source-maps')
      expect(env).toMatchObject({
        GREETING: 'deployed',
        AWS_ENDPOINT_URL: 'https://deployed.example',
        // Lambda's own values: the region from the deployed configuration, the rest as brought.
        AWS_REGION: 'us-east-1',
        AWS_LAMBDA_FUNCTION_NAME: 'svc-dev-api',
        AWS_LAMBDA_LOG_STREAM_NAME: '2026/10/13/[$LATEST]abc',
      })
      // The role credentials an invocation brings are what the handler gets.
      expect(role).toBe('ASIAFUNCTIONROLE0001')
      expect(logger.lines).toContainEqual([
        'debug',
        "Dev Mode did not apply AWS_ENDPOINT_URL, BASH_FUNC_ls%%, GIT_SSH_COMMAND, GREETING, NODE_OPTIONS, PS4, PYTHONWARNINGS, SHELLOPTS from an invocation of api: a handler on this machine runs with the deployed configuration's variables",
      ])
    })

    test('a variable that starts other code is not applied from the deployed configuration either', async () => {
      const { invoke } = await setup({
        files: { 'handler.mjs': ENV_HANDLER },
        deployedVariables: {
          SHELLOPTS: 'xtrace',
          PS4: '$(id)',
          GIT_CONFIG_COUNT: '1',
          PYTHONWARNINGS: 'ignore::pkg.Warning',
          SSLKEYLOGFILE: '/tmp/keys',
          ENV: 'production',
        },
      })
      const { env } = body(await invoke())
      for (const name of [
        'SHELLOPTS',
        'PS4',
        'GIT_CONFIG_COUNT',
        'PYTHONWARNINGS',
        'SSLKEYLOGFILE',
      ]) {
        expect(env).not.toHaveProperty([name])
      }
      expect(env.ENV).toBe('production')
    })

    test('a replay runs with the deployed configuration too', async () => {
      const { runtime, send } = await setup({
        files: { 'handler.mjs': ENV_HANDLER },
      })
      await collect(await send({ environment: deployedEnv(FORGED) }))
      const { env } = body(
        await collect(
          await send({
            environmentId: REPLAY_ENVIRONMENT_ID,
            environment: runtime.latestEnvironment('api'),
          }),
        ),
      )
      expect(env.GREETING).toBe('deployed')
      expect(env).not.toHaveProperty('PS4')
      expect(env.NODE_OPTIONS).toBe('--enable-source-maps')
    })
  })

  test('workers lists the handler processes with their pid and whether they are busy', async () => {
    const { send, invoke, runtime, output } = await setup()
    expect(runtime.workers()).toEqual([])
    const { pid } = body(await invoke())
    expect(runtime.workers()).toEqual([
      { functionKey: 'api', pid, busy: false },
    ])
    const running = send({ event: { sleepMs: 500 } })
    expect(await waitFor(() => output.of('start').length === 2)).toBe(true)
    expect(runtime.workers()).toEqual([{ functionKey: 'api', pid, busy: true }])
    await collect(await running)
    expect(runtime.workers()).toEqual([
      { functionKey: 'api', pid, busy: false },
    ])
  })

  test('reload while idle stops the worker; the next invocation starts the new code', async () => {
    const { invoke, runtime, serviceDir, output } = await setup()
    const before = body(await invoke())
    write(serviceDir, { 'handler.mjs': HANDLER('v2') })
    runtime.reload(['api'])
    const after = body(await invoke())
    expect(after).toMatchObject({ version: 'v2', count: 1 })
    expect(after.pid).not.toBe(before.pid)
    expect(output.of('start').map((call) => call.newWorker)).toEqual([
      true,
      true,
    ])
  })

  test('reload while busy lets the invocation finish, then the next one starts the new code', async () => {
    const { send, invoke, runtime, serviceDir, output } = await setup()
    // A warm worker has loaded v1 however slowly it started.
    const { pid } = body(await invoke())
    const running = send({ event: { sleepMs: 800 } })
    expect(await waitFor(() => output.of('start').length === 2)).toBe(true)
    write(serviceDir, { 'handler.mjs': HANDLER('v2') })
    runtime.reload(['api'])
    expect(body(await collect(await running))).toMatchObject({
      version: 'v1',
      count: 2,
      pid,
    })
    const after = body(await invoke())
    expect(after).toMatchObject({ version: 'v2', count: 1 })
    expect(after.pid).not.toBe(pid)
  })

  test('reload while a worker is still being prepared replaces it after its invocation', async () => {
    const gated = gatedAdapter()
    const { send, invoke, runtime } = await setup({ adapter: gated.adapter })
    const first = send()
    runtime.reload(['api'])
    gated.release()
    const { pid } = body(await collect(await first))
    const next = body(await invoke())
    expect(next.count).toBe(1)
    expect(next.pid).not.toBe(pid)
  })

  test('reload leaves other functions alone', async () => {
    const { invoke, runtime } = await setup()
    const before = body(await invoke())
    runtime.reload(['other'])
    expect(body(await invoke()).pid).toBe(before.pid)
  })

  test('two first invocations of one environment start one process', async () => {
    const { send, output, runtime } = await setup()
    const replies = await Promise.all([
      send({ environmentId: 'env-x' }),
      send({ environmentId: 'env-x' }),
    ])
    const bodies = await Promise.all(
      replies.map(async (reply) => body(await collect(reply))),
    )
    expect(bodies.map((b) => b.count).sort()).toEqual([1, 2])
    expect(new Set(bodies.map((b) => b.pid)).size).toBe(1)
    expect(output.of('start').filter((call) => call.newWorker)).toHaveLength(1)
    expect(runtime.workerCount()).toBe(1)
  })

  test('a burst of twelve new environments gets twelve processes and twelve answers', async () => {
    const { send, runtime } = await setup()
    const replies = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        send({ environmentId: `burst-${index}` }),
      ),
    )
    const bodies = await Promise.all(
      replies.map(async (reply) => body(await collect(reply))),
    )
    expect(bodies.every((b) => b.count === 1)).toBe(true)
    expect(new Set(bodies.map((b) => b.pid)).size).toBe(12)
    expect(runtime.workerCount()).toBe(12)
  })

  test('a worker that exits during an invocation fails it with Runtime.ExitError, and the next invocation starts again', async () => {
    const { invoke, output } = await setup()
    const crashed = await invoke({ requestId: 'req-crash', event: { exit: 3 } })
    expect(crashed).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.ExitError',
    })
    expect(body(crashed).errorMessage).toBe(
      'RequestId: req-crash Error: Runtime exited with error: exit status 3',
    )
    expect(output.of('workerExited')).toEqual([
      expect.objectContaining({
        functionKey: 'api',
        requestId: 'req-crash',
        code: 3,
      }),
    ])
    expect(body(await invoke()).count).toBe(1)
  })

  test('an init error answers the invocation, and the next invocation tries again', async () => {
    const { invoke, output } = await setup({
      files: { 'handler.mjs': 'export const other = 1\n' },
    })
    expect(await invoke()).toMatchObject({
      kind: 'init_error',
      errorType: 'Runtime.HandlerNotFound',
    })
    expect(await invoke()).toMatchObject({
      kind: 'init_error',
      errorType: 'Runtime.HandlerNotFound',
    })
    expect(output.of('workerExited')).toEqual([])
  })

  test('a worker that exits 0 before it asks for its first invocation fails that invocation as an init error showing the exit', async () => {
    const { invoke, output, runtime } = await setup({
      files: {
        'handler.mjs': [
          'await new Promise(() => {})',
          'export const handler = async () => 1',
          '',
        ].join('\n'),
      },
    })
    const reply = await invoke({ requestId: 'req-init-0' })
    expect(reply).toMatchObject({
      kind: 'init_error',
      errorType: 'Runtime.ExitError',
    })
    expect(body(reply).errorMessage).toBe(
      'RequestId: req-init-0 Error: Runtime exited with error: exit status 0',
    )
    expect(output.of('end')).toEqual([
      expect.objectContaining({
        requestId: 'req-init-0',
        reply: expect.objectContaining({
          kind: 'init_error',
          errorType: 'Runtime.ExitError',
        }),
      }),
    ])
    expect(runtime.workerCount()).toBe(0)
    expect(
      await invoke({ requestId: 'req-init-again' }).then(body),
    ).toMatchObject({
      errorMessage:
        'RequestId: req-init-again Error: Runtime exited with error: exit status 0',
    })
    expect(output.of('start').map((call) => call.newWorker)).toEqual([
      true,
      true,
    ])
  })

  test('a worker that exits with an error code during init fails the invocation as an init error showing that code', async () => {
    const { invoke } = await setup({
      files: { 'handler.mjs': 'process.exit(2)\n' },
    })
    const reply = await invoke({ requestId: 'req-init-2' })
    expect(reply).toMatchObject({
      kind: 'init_error',
      errorType: 'Runtime.ExitError',
    })
    expect(body(reply).errorMessage).toBe(
      'RequestId: req-init-2 Error: Runtime exited with error: exit status 2',
    )
  })

  test('a worker that cannot be spawned fails the invocation instead of leaving it waiting', async () => {
    const missing = {
      ...nodeAdapter,
      start: (options) =>
        nodeAdapter.start({
          ...options,
          local: { ...options.local, command: path.join(tempDir(), 'no-node') },
        }),
    }
    const { invoke, runtime } = await setup({ adapter: missing })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reply = await invoke()
      expect(reply).toMatchObject({
        kind: 'init_error',
        errorType: 'Runtime.Unknown',
      })
      expect(body(reply).errorMessage).toMatch(
        /^Dev Mode could not run the local worker for api: .*ENOENT/,
      )
      expect(runtime.workerCount()).toBe(0)
    }
  })

  test('an invocation whose deadline passed is dropped without starting a process', async () => {
    const { send, runtime, output } = await setup()
    expect(await send({ deadlineMs: Date.now() - 1 })).toEqual({
      kind: 'expired',
    })
    expect(runtime.workerCount()).toBe(0)
    expect(output.calls).toEqual([])
  })

  test('an invocation for a function outside the session is not_in_dev', async () => {
    const { send } = await setup()
    expect(await send({ functionKey: 'elsewhere' })).toEqual({
      kind: 'not_in_dev',
    })
  })

  test('a first invocation without its environment is refused', async () => {
    const { runtime } = await setup()
    const reply = await runtime.invoke({
      functionKey: 'api',
      environmentId: 'env-9',
      ...invocation(),
    })
    expect(reply).toMatchObject({ kind: 'error', errorType: 'Runtime.Unknown' })
    expect(runtime.workerCount()).toBe(0)
  })

  test('an invocation without an execution environment id is refused', async () => {
    const { runtime } = await setup()
    const reply = await runtime.invoke({
      functionKey: 'api',
      environment: deployedEnv(),
      ...invocation(),
    })
    expect(reply).toMatchObject({ kind: 'error', errorType: 'Runtime.Unknown' })
    expect(runtime.workerCount()).toBe(0)
  })

  test('log lines are attributed to the invocation that wrote them', async () => {
    const { invoke, output } = await setup()
    await invoke({
      requestId: 'req-log',
      event: { log: 'hello from the handler' },
    })
    const logged = () =>
      output
        .of('log')
        .some(
          (call) =>
            call.functionKey === 'api' &&
            call.requestId === 'req-log' &&
            call.text === 'hello from the handler',
        )
    expect(await waitFor(logged)).toBe(true)
    // stdout and stderr are shown alike, so a log line does not say which it came from.
    expect(
      output.of('log').every((call) => !Object.hasOwn(call, 'stream')),
    ).toBe(true)
  })

  test('a streaming reply passes through, and the end line gets its chunks and first byte', async () => {
    const { invoke, output } = await setup({
      files: { 'handler.mjs': STREAMING_HANDLER },
    })
    const reply = await invoke()
    expect(reply.kind).toBe('stream')
    expect(reply.text).toBe('ab')
    expect(await waitFor(() => output.of('end').length === 1)).toBe(true)
    const [end] = output.of('end')
    expect(end.chunks).toBeGreaterThanOrEqual(2)
    expect(end.firstByteMs).toEqual(expect.any(Number))
    expect(end.trailers).toEqual({ errorType: null, errorBody: null })
    expect(end.head.toString()).toBe('ab')
  })

  test('starts and ends carry the raw event, the execution environment, the runtime headers and the source', async () => {
    const { invoke, output, runtime } = await setup()
    await invoke({ requestId: 'req-raw', event: { hello: 'raw' } })
    for (const call of [output.of('start')[0], output.of('end')[0]]) {
      expect(call.eventBytes.toString()).toBe(JSON.stringify({ hello: 'raw' }))
      expect(call).toMatchObject({ environmentId: 'env-1', source: 'caller' })
      expect(call.headers['lambda-runtime-aws-request-id']).toBe('req-raw')
      expect(call).not.toHaveProperty('environment')
    }
    await collect(
      await runtime.invoke({
        functionKey: 'api',
        environmentId: 'env-1',
        source: 'replay',
        ...invocation({ requestId: 'req-replay' }),
      }),
    )
    expect(output.of('start')[1].source).toBe('replay')
    expect(output.of('end')[1].source).toBe('replay')
  })

  test("a stream's end gets its body's first bytes and its full size", async () => {
    const { invoke, output } = await setup({
      files: { 'handler.mjs': STREAMING_HANDLER },
    })
    await invoke()
    expect(await waitFor(() => output.of('end').length === 1)).toBe(true)
    const [end] = output.of('end')
    expect(end.bodyHead.toString()).toBe('ab')
    expect(end.bodyBytes).toBe(2)
  })

  test("a stream's end keeps at most its first MiB, and counts every byte", async () => {
    const { invoke, output } = await setup({
      files: { 'handler.mjs': LARGE_STREAMING_HANDLER },
    })
    const reply = await invoke()
    expect(reply.kind).toBe('stream')
    expect(await waitFor(() => output.of('end').length === 1)).toBe(true)
    const [end] = output.of('end')
    expect(STREAM_HEAD_BYTES).toBe(1024 * 1024)
    expect(end.bodyHead.length).toBe(STREAM_HEAD_BYTES)
    expect(end.bodyHead.every((byte) => byte === 120)).toBe(true)
    expect(end.bodyBytes).toBe(24 * 65536)
  })

  test("the end line counts the body chunks the caller receives, never the stream's HTTP prelude", async () => {
    const { invoke, output } = await setup({
      files: { 'handler.mjs': PRELUDE_STREAMING_HANDLER },
    })
    const reply = await invoke()
    expect(reply.kind).toBe('stream')
    expect(reply.text.endsWith(`${'\0'.repeat(8)}abc`)).toBe(true)
    expect(await waitFor(() => output.of('end').length === 1)).toBe(true)
    expect(output.of('end')[0].chunks).toBe(3)
  })

  test('the end line knows when the invocation ran past its deadline', async () => {
    const { invoke, output } = await setup()
    await invoke({ deadlineMs: Date.now() + 300, event: { sleepMs: 700 } })
    const [end] = output.of('end')
    expect(end.endedAt).toBeGreaterThan(end.deadlineMs)
    expect(end.timeoutSeconds).toBe(6)
  })

  test('output that throws never fails an invocation or leaves an unhandled rejection', async () => {
    const unhandled = []
    const onUnhandled = (reason) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const buffered = await setup({ output: throwingOutput() })
      const replies = [
        await buffered.invoke({ event: { log: 'still shown?' } }),
        await buffered.invoke({ requestId: 'req-crash', event: { exit: 3 } }),
      ]
      expect(body(replies[0])).toMatchObject({ version: 'v1', count: 1 })
      expect(replies[1]).toMatchObject({ errorType: 'Runtime.ExitError' })
      const streaming = await setup({
        output: throwingOutput(),
        files: { 'handler.mjs': STREAMING_HANDLER },
      })
      const streamed = await streaming.invoke()
      expect(streamed.text).toBe('ab')
      const swallowed = (logger, name) =>
        logger.lines.some(
          ([level, text]) =>
            level === 'debug' && text.includes(`${name} broke`),
        )
      expect(await waitFor(() => swallowed(streaming.logger, 'end'))).toBe(true)
      for (const name of ['start', 'log', 'end', 'workerExited']) {
        expect(swallowed(buffered.logger, name)).toBe(true)
      }
      // Invocations keep working after all of that.
      expect(body(await buffered.invoke()).count).toBe(1)
      await sleep(50)
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  test('an idle worker stops after the idle time', async () => {
    const { invoke, runtime } = await setup({ idleMs: 200 })
    const { pid } = body(await invoke())
    expect(await waitFor(() => runtime.workerCount() === 0)).toBe(true)
    expect(await waitFor(() => !alive(pid))).toBe(true)
  })

  test('stop fails a running invocation instead of leaving it waiting, and leaves no process, timer or file behind', async () => {
    const entry = await setup()
    const { pid } = body(await entry.invoke())
    const running = entry.send({ event: { sleepMs: 10_000 } })
    expect(await waitFor(() => entry.output.of('start').length === 2)).toBe(
      true,
    )
    await entry.runtime.stop()
    expect(await running).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.ExitError',
    })
    expect(alive(pid)).toBe(false)
    // The stop's own kills are not reported as a worker that exited.
    expect(entry.output.of('workerExited')).toEqual([])
    expect(entry.timers.live()).toBe(0)
    expect(fs.readdirSync(entry.tmpRoot)).toEqual([])
    expect(entry.processRef.listenerCount('exit')).toBe(0)
    expect(
      await entry.runtime.invoke({
        functionKey: 'api',
        environmentId: 'env-1',
        environment: deployedEnv(),
        ...invocation(),
      }),
    ).toMatchObject({ kind: 'error' })
  })

  test('stop while a worker is being prepared starts no process and answers its invocation', async () => {
    const gated = gatedAdapter()
    const entry = await setup({ adapter: gated.adapter })
    // send() reaches the adapter's prepare before it returns.
    const pending = entry.send()
    const stopping = entry.runtime.stop()
    gated.release()
    await stopping
    expect(await pending).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.Unknown',
    })
    expect(gated.children).toEqual([])
    expect(entry.timers.live()).toBe(0)
  })

  test('stop while a worker is still initializing stops it and fails its invocation as an init error', async () => {
    const gated = gatedAdapter()
    const entry = await setup({
      adapter: gated.adapter,
      files: {
        'handler.mjs': [
          'await new Promise((resolve) => setTimeout(resolve, 30_000))',
          'export const handler = async () => 1',
          '',
        ].join('\n'),
      },
    })
    gated.release()
    const pending = entry.send()
    expect(await waitFor(() => gated.children.length === 1)).toBe(true)
    // Whether or not the client has reached the import yet, it has not asked for an invocation.
    const [child] = gated.children
    await entry.runtime.stop()
    expect(await pending).toMatchObject({
      kind: 'init_error',
      errorType: 'Runtime.ExitError',
    })
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
    expect(alive(child.pid)).toBe(false)
  })

  test('the exit hook kills every handler process', async () => {
    const { invoke, processRef } = await setup()
    const { pid } = body(await invoke())
    processRef.emit('exit')
    expect(await waitFor(() => !alive(pid))).toBe(true)
  })

  test('the session temp directory holds the empty AWS and boto config files while running', async () => {
    const { tmpRoot } = await setup()
    const [dir] = fs.readdirSync(tmpRoot)
    expect(dir).toMatch(/^sls-dev-/)
    const files = fs.readdirSync(path.join(tmpRoot, dir)).sort()
    expect(files).toEqual(['aws-config', 'aws-credentials', 'boto-config'])
    for (const file of files) {
      expect(fs.readFileSync(path.join(tmpRoot, dir, file), 'utf8')).toBe('')
    }
  })

  test('the session temp directory is named after this process, and start removes those of sessions whose process is gone', async () => {
    const tmpRoot = tempDir('sls-dev-tmp-')
    const gone = await exitedPid()
    const stale = `sls-dev-${gone}-a1B2c3`
    const running = `sls-dev-${process.pid}-d4E5f6`
    for (const name of [stale, running]) {
      write(path.join(tmpRoot, name), {
        'aws-config': '',
        'aws-credentials': '',
        'boto-config': '',
      })
    }
    await setup({ tmpRoot })
    const left = fs.readdirSync(tmpRoot)
    expect(left).not.toContain(stale)
    expect(left).toContain(running)
    expect(
      left.filter((name) =>
        new RegExp(`^sls-dev-${process.pid}-[A-Za-z0-9]{6}$`).test(name),
      ),
    ).toHaveLength(2)
  })
})

/** The pid of a process that has already exited. */
const exitedPid = () =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', ''], {
      stdio: 'ignore',
      env: baseEnv(),
      windowsHide: true,
    })
    child.on('exit', () => resolve(child.pid))
  })

/**
 * A clock that never moves, for the deadline tests: the runtime arms the deadline at
 * `deadlineMs - now() + 1000`, so with a still clock the delay is exact however slow the machine.
 */
const NOW = Date.now()

/** countingTimers that also records every timeout's delay, so a test can fire one early. */
const recordingTimers = () => {
  const base = countingTimers()
  const armed = []
  return {
    ...base,
    armed,
    setTimeout(callback, ms) {
      const entry = { ms, done: false, callback }
      entry.handle = base.setTimeout(() => {
        entry.done = true
        callback()
      }, ms)
      armed.push(entry)
      return entry.handle
    },
    clearTimeout(handle) {
      const entry = armed.find((item) => item.handle === handle)
      if (entry) entry.done = true
      base.clearTimeout(handle)
    },
    fire(entry) {
      base.clearTimeout(entry.handle)
      entry.done = true
      entry.callback()
    },
  }
}

const HANGING_STREAM = [
  'export const handler = awslambda.streamifyResponse(async (event, responseStream) => {',
  "  responseStream.write('a')",
  '  await new Promise((resolve) => setTimeout(resolve, 60_000))',
  '  responseStream.end()',
  '})',
  '',
].join('\n')

describe('the cap on handler processes', () => {
  test('is 24 processes per session', () => {
    expect(MAX_WORKERS).toBe(24)
  })

  test('at the cap, the least recently used idle process stops and the new environment gets its own', async () => {
    // A clock that never moves: every process goes idle in the same millisecond, as two quick
    // invocations often do, so the order they went idle in has to come from their use.
    const { invoke, runtime } = await setup({ maxWorkers: 2, now: () => NOW })
    const first = body(await invoke({ environmentId: 'env-1' }))
    const second = body(await invoke({ environmentId: 'env-2' }))
    // env-1 is used again: env-2 is now the one idle the longest.
    expect(body(await invoke({ environmentId: 'env-1' })).pid).toBe(first.pid)
    const third = body(await invoke({ environmentId: 'env-3' }))
    expect(third.count).toBe(1)
    expect(await waitFor(() => !alive(second.pid))).toBe(true)
    expect(alive(first.pid)).toBe(true)
    expect(runtime.workerCount()).toBe(2)
    // Its environment gets a new process on its next invocation, as after an idle exit.
    const again = body(await invoke({ environmentId: 'env-2' }))
    expect(again.count).toBe(1)
    expect(again.pid).not.toBe(second.pid)
  })

  test('when every process is busy, a new environment is not accepted, and one is again once a process is idle', async () => {
    const { send, invoke, runtime } = await setup({ maxWorkers: 1 })
    const busy = send({ environmentId: 'env-1', event: { sleepMs: 1_000 } })
    expect(
      await waitFor(() => runtime.workers().some((worker) => worker.busy)),
    ).toBe(true)
    expect(
      runtime.reserve({ functionKey: 'api', environmentId: 'env-2' }),
    ).toBeNull()
    // An invocation that comes without a reserved place follows the same rule.
    expect(await send({ environmentId: 'env-2' })).toMatchObject({
      kind: 'not_in_dev',
      reason: 'worker_limit',
    })
    // The busy environment's own invocations still queue on its process.
    const own = runtime.reserve({ functionKey: 'api', environmentId: 'env-1' })
    expect(own).not.toBeNull()
    own.release()
    expect(body(await collect(await busy)).count).toBe(1)
    expect(body(await invoke({ environmentId: 'env-2' })).count).toBe(1)
    expect(runtime.workerCount()).toBe(1)
  })

  test('a process that exits frees its place', async () => {
    const { invoke, runtime } = await setup({ maxWorkers: 1 })
    expect(
      await invoke({ environmentId: 'env-1', event: { exit: 3 } }),
    ).toMatchObject({ kind: 'error' })
    expect(await waitFor(() => runtime.workerCount() === 0)).toBe(true)
    expect(body(await invoke({ environmentId: 'env-2' })).count).toBe(1)
  })

  test('an environment reserved against its idle process keeps that process while its acceptance travels', async () => {
    const { runtime } = await setup({ maxWorkers: 1 })
    const run = async (environmentId, slot) =>
      body(
        await collect(
          await runtime.invoke({
            functionKey: 'api',
            environmentId,
            environment: deployedEnv(),
            ...invocation(),
            ...(slot && { slot }),
          }),
        ),
      )
    const first = await run('env-1')
    // env-1's next request is reserved: its process is held for it, not given to env-2.
    const own = runtime.reserve({ functionKey: 'api', environmentId: 'env-1' })
    expect(
      runtime.reserve({ functionKey: 'api', environmentId: 'env-2' }),
    ).toBeNull()
    const next = await run('env-1', own)
    expect(next.pid).toBe(first.pid)
    expect(next.count).toBe(2)
  })

  test('an idle process is stopped for a new environment only once its invocation starts', async () => {
    const { runtime } = await setup({ maxWorkers: 1 })
    const run = async (environmentId, slot) =>
      body(
        await collect(
          await runtime.invoke({
            functionKey: 'api',
            environmentId,
            environment: deployedEnv(),
            ...invocation(),
            ...(slot && { slot }),
          }),
        ),
      )
    const first = await run('env-1')
    // A place for env-2 whose acceptance is then not sent: the idle process stays.
    const unsent = runtime.reserve({
      functionKey: 'api',
      environmentId: 'env-2',
    })
    expect(unsent).not.toBeNull()
    unsent.release()
    expect(alive(first.pid)).toBe(true)
    expect((await run('env-1')).pid).toBe(first.pid)
    // One that is used stops it when env-2's process starts.
    const used = runtime.reserve({ functionKey: 'api', environmentId: 'env-2' })
    expect(alive(first.pid)).toBe(true)
    const second = await run('env-2', used)
    expect(second.count).toBe(1)
    expect(await waitFor(() => !alive(first.pid))).toBe(true)
  })

  test('a process that has not run its first invocation is never stopped for another', async () => {
    const { send, runtime } = await setup({
      maxWorkers: 1,
      files: {
        'handler.mjs': `await new Promise((resolve) => setTimeout(resolve, 800))\n${HANDLER('v1')}`,
      },
    })
    const starting = send({ environmentId: 'env-1' })
    expect(await waitFor(() => runtime.workers().length === 1)).toBe(true)
    expect(
      runtime.reserve({ functionKey: 'api', environmentId: 'env-2' }),
    ).toBeNull()
    expect(body(await collect(await starting)).count).toBe(1)
  })

  test('a reserved place counts until its invocation starts the process, and is given back when not used', async () => {
    const { send, runtime } = await setup({ maxWorkers: 1 })
    const slot = runtime.reserve({ functionKey: 'api', environmentId: 'env-1' })
    expect(slot).not.toBeNull()
    expect(
      runtime.reserve({ functionKey: 'api', environmentId: 'env-2' }),
    ).toBeNull()
    const reply = await runtime.invoke({
      functionKey: 'api',
      environmentId: 'env-1',
      environment: deployedEnv(),
      ...invocation(),
      slot,
    })
    expect(body(await collect(reply)).count).toBe(1)
    // An unused place is given back.
    const unused = runtime.reserve({
      functionKey: 'api',
      environmentId: 'env-9',
    })
    expect(unused).not.toBeNull()
    unused.release()
    unused.release()
    expect(
      runtime.reserve({ functionKey: 'api', environmentId: 'env-8' }),
    ).not.toBeNull()
  })

  test('a replay follows the same rule', async () => {
    const { send, runtime } = await setup({ maxWorkers: 1 })
    const busy = send({ environmentId: 'env-1', event: { sleepMs: 1_000 } })
    expect(
      await waitFor(() => runtime.workers().some((worker) => worker.busy)),
    ).toBe(true)
    const replay = await send({
      environmentId: REPLAY_ENVIRONMENT_ID,
      source: 'replay',
    })
    expect(replay).toMatchObject({ kind: 'not_in_dev', reason: 'worker_limit' })
    expect(replay.message).toContain('1 handler process')
    await collect(await busy)
  })
})

describe('the deadline on this machine', () => {
  test("an invocation still running at its deadline ends with Lambda's timeout error; its worker is killed and the next invocation starts a new one", async () => {
    const { send, invoke, output, runtime } = await setup()
    const first = body(await invoke())
    const sentAt = Date.now()
    const reply = await collect(
      await send({
        requestId: 'req-timeout-0000',
        deadlineMs: Date.now() + 300,
        event: { sleepMs: 60_000 },
      }),
    )
    expect(Date.now() - sentAt).toBeLessThan(10_000)
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Sandbox.Timedout',
    })
    expect(body(reply)).toEqual({
      errorType: 'Sandbox.Timedout',
      errorMessage:
        'RequestId: req-timeout-0000 Error: Task timed out after 6.00 seconds',
    })
    expect(await waitFor(() => !alive(first.pid))).toBe(true)
    const end = output.of('end')[1]
    expect(end).toMatchObject({
      requestId: 'req-timeout-0000',
      reply: expect.objectContaining({ errorType: 'Sandbox.Timedout' }),
      timeoutSeconds: 6,
    })
    expect(end.endedAt).toBeGreaterThan(end.deadlineMs)
    // Dev Mode ended that worker itself: no "worker exited" warning.
    expect(output.of('workerExited')).toEqual([])
    expect(await waitFor(() => runtime.workerCount() === 0)).toBe(true)
    const next = body(await invoke())
    expect(next.pid).not.toBe(first.pid)
    expect(next.count).toBe(1)
  })

  test('the deadline is armed through the injected timers, one grace second after it', async () => {
    const timers = recordingTimers()
    const entry = await setup({ timers, now: () => NOW })
    const { pid } = body(await entry.invoke())
    const pending = entry.send({
      deadlineMs: NOW + 60_000,
      event: { sleepMs: 60_000 },
    })
    expect(await waitFor(() => entry.output.of('start').length === 2)).toBe(
      true,
    )
    const deadline = timers.armed.find(
      (item) => !item.done && item.ms === 61_000,
    )
    expect(deadline).toBeDefined()
    timers.fire(deadline)
    expect(await pending).toMatchObject({
      kind: 'error',
      errorType: 'Sandbox.Timedout',
    })
    expect(await waitFor(() => !alive(pid))).toBe(true)
  })

  test('without a usable deadline nothing ends an invocation early', async () => {
    const timers = recordingTimers()
    const entry = await setup({ timers })
    const reply = await entry.invoke({
      headers: { 'lambda-runtime-deadline-ms': 'soon' },
      event: { sleepMs: 300 },
    })
    expect(body(reply).count).toBe(1)
    // Only the idle timer of the warm worker.
    expect(timers.armed.map((item) => item.ms)).toEqual([WORKER_IDLE_MS])
  })

  test('a deadline further away than any Lambda invocation can have is capped, so a fresh process is not ended at once', async () => {
    const timers = recordingTimers()
    const entry = await setup({ timers })
    // Past the largest delay a timer takes (about 24.8 days), Node fires it at once.
    const reply = await entry.invoke({
      headers: { 'lambda-runtime-deadline-ms': String(Date.now() + 1e15) },
      event: { sleepMs: 300 },
    })
    expect(body(reply).count).toBe(1)
    const deadlineTimer = timers.armed.find(
      (item) => item.ms !== WORKER_IDLE_MS,
    )
    expect(deadlineTimer.ms).toBeLessThanOrEqual(
      MAX_REMAINING_MS + DEADLINE_GRACE_MS,
    )
    expect(deadlineTimer.ms).toBeGreaterThan(14 * 60_000)
  })

  test('a stream still open at its deadline ends with the timeout error in its trailers', async () => {
    const { invoke, output } = await setup({
      files: { 'handler.mjs': HANGING_STREAM },
    })
    const reply = await invoke({
      requestId: 'req-stream-timeout',
      deadlineMs: Date.now() + 300,
    })
    expect(reply.kind).toBe('stream')
    expect(reply.text).toBe('a')
    expect(reply.trailers.errorType).toBe('Sandbox.Timedout')
    expect(
      JSON.parse(Buffer.from(reply.trailers.errorBody, 'base64').toString()),
    ).toEqual({
      errorType: 'Sandbox.Timedout',
      errorMessage:
        'RequestId: req-stream-timeout Error: Task timed out after 6.00 seconds',
    })
    expect(await waitFor(() => output.of('end').length === 1)).toBe(true)
    expect(output.of('end')[0].trailers.errorType).toBe('Sandbox.Timedout')
    expect(output.of('workerExited')).toEqual([])
  })

  test('the deadline also ends an invocation still waiting for its worker to be prepared, and that worker never runs', async () => {
    const timers = recordingTimers()
    const gated = gatedAdapter()
    const entry = await setup({
      timers,
      adapter: gated.adapter,
      now: () => NOW,
    })
    const pending = entry.send({
      requestId: 'req-slow-start',
      deadlineMs: NOW + 60_000,
    })
    // Armed when the invocation is accepted, before its worker exists.
    const deadline = timers.armed.find(
      (item) => !item.done && item.ms === 61_000,
    )
    expect(deadline).toBeDefined()
    timers.fire(deadline)
    const reply = await pending
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Sandbox.Timedout',
    })
    expect(body(await collect(reply)).errorMessage).toBe(
      'RequestId: req-slow-start Error: Task timed out after 6.00 seconds',
    )
    expect(entry.output.of('start')).toEqual([
      expect.objectContaining({ requestId: 'req-slow-start', newWorker: true }),
    ])
    expect(entry.output.of('end')).toEqual([
      expect.objectContaining({
        requestId: 'req-slow-start',
        reply: expect.objectContaining({ errorType: 'Sandbox.Timedout' }),
      }),
    ])
    // The worker that was being prepared is ended as soon as it starts.
    gated.release()
    expect(await waitFor(() => gated.children.length === 1)).toBe(true)
    const [child] = gated.children
    expect(
      await waitFor(() => child.exitCode !== null || child.signalCode !== null),
    ).toBe(true)
    expect(entry.runtime.workerCount()).toBe(0)
  })

  test('a deadline during a start two invocations share ends only its own invocation; the other is served by that worker', async () => {
    const timers = recordingTimers()
    const gated = gatedAdapter()
    const entry = await setup({
      timers,
      adapter: gated.adapter,
      now: () => NOW,
    })
    const first = entry.send({
      requestId: 'req-short',
      deadlineMs: NOW + 60_000,
    })
    const second = entry.send({
      requestId: 'req-long',
      deadlineMs: NOW + 120_000,
    })
    const short = timers.armed.find((item) => !item.done && item.ms === 61_000)
    expect(short).toBeDefined()
    timers.fire(short)
    expect(await first).toMatchObject({ errorType: 'Sandbox.Timedout' })
    gated.release()
    const served = await collect(await second)
    expect(served.kind).toBe('response')
    expect(body(served)).toMatchObject({ version: 'v1', count: 1 })
    expect(gated.children).toHaveLength(1)
    expect(alive(gated.children[0].pid)).toBe(true)
  })

  test('after a deadline during a start nobody else waits on, the next invocation starts its own worker', async () => {
    const timers = recordingTimers()
    const gated = gatedAdapter()
    const entry = await setup({
      timers,
      adapter: gated.adapter,
      now: () => NOW,
    })
    const first = entry.send({ deadlineMs: NOW + 60_000 })
    timers.fire(timers.armed.find((item) => !item.done && item.ms === 61_000))
    expect(await first).toMatchObject({ errorType: 'Sandbox.Timedout' })
    const next = entry.send()
    gated.release()
    expect(body(await collect(await next))).toMatchObject({ count: 1 })
    expect(gated.children).toHaveLength(2)
    expect(
      await waitFor(
        () =>
          gated.children[0].exitCode !== null ||
          gated.children[0].signalCode !== null,
      ),
    ).toBe(true)
    expect(entry.runtime.workerCount()).toBe(1)
  })

  test('a worker that takes past the deadline to be prepared does not hold its invocation', async () => {
    const slow = {
      ...nodeAdapter,
      prepare: async (options) => {
        await sleep(3_000)
        return nodeAdapter.prepare(options)
      },
    }
    const { send } = await setup({ adapter: slow })
    const sentAt = Date.now()
    const reply = await send({ deadlineMs: Date.now() + 300 })
    expect(Date.now() - sentAt).toBeLessThan(2_900)
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Sandbox.Timedout',
    })
  })

  test('an invocation queued behind one that timed out gets an outcome under its own request id', async () => {
    const { send, invoke } = await setup()
    await invoke()
    const timedOut = send({
      requestId: 'req-hung',
      deadlineMs: Date.now() + 300,
      event: { sleepMs: 60_000 },
    })
    const queued = send({ requestId: 'req-queued' })
    expect(await timedOut).toMatchObject({ errorType: 'Sandbox.Timedout' })
    const reply = await collect(await queued)
    expect(reply.text).not.toContain('req-hung')
    if (reply.kind === 'error') {
      expect(body(reply).errorMessage).toContain('RequestId: req-queued ')
    } else {
      expect(body(reply).count).toBe(1)
    }
  })

  test('a handler whose init outlasts the deadline times out the same way', async () => {
    const { invoke, runtime } = await setup({
      files: {
        'handler.mjs': [
          'await new Promise((resolve) => setTimeout(resolve, 60_000))',
          'export const handler = async () => 1',
          '',
        ].join('\n'),
      },
    })
    // The pending timer keeps the process alive, so the client never exits on its own.
    const sentAt = Date.now()
    const reply = await invoke({ deadlineMs: Date.now() + 300 })
    expect(Date.now() - sentAt).toBeLessThan(10_000)
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Sandbox.Timedout',
    })
    expect(await waitFor(() => runtime.workerCount() === 0)).toBe(true)
  })
})

describe('handler output without a newline', () => {
  test('is shown while the invocation still runs', async () => {
    const { send, output } = await setup({
      files: {
        'handler.mjs': [
          'export const handler = async () => {',
          "  process.stdout.write('\\r 50%')",
          '  await new Promise((resolve) => setTimeout(resolve, 3_000))',
          '  return 1',
          '}',
          '',
        ].join('\n'),
      },
    })
    const pending = send({ requestId: 'req-progress' })
    expect(
      await waitFor(() =>
        output
          .of('log')
          .some(
            (call) => call.text === ' 50%' && call.requestId === 'req-progress',
          ),
      ),
    ).toBe(true)
    expect(output.of('end')).toEqual([])
    await pending
  })
})

describe('the response size on this machine', () => {
  test("a buffered response over Lambda's 6 MB fails the invocation the way Lambda does, and the worker stays warm", async () => {
    const { invoke } = await setup({
      files: {
        'handler.mjs': [
          'export const handler = async (event) =>',
          "  event.big ? 'x'.repeat(7 * 1024 * 1024) : { pid: process.pid }",
          '',
        ].join('\n'),
      },
    })
    const { pid } = body(await invoke())
    const reply = await invoke({ event: { big: true } })
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Function.ResponseSizeTooLarge',
    })
    expect(body(await invoke()).pid).toBe(pid)
  })
})

describe('what a replay reuses', () => {
  test('the latest environment of each function is kept for replays and dropped at stop', async () => {
    const { invoke, runtime } = await setup()
    await invoke({ environment: deployedEnv({ A: '1' }) })
    await invoke({ environment: deployedEnv({ A: '2' }) })
    expect(runtime.latestEnvironment('api')).toEqual(deployedEnv({ A: '2' }))
    expect(runtime.latestEnvironment('other')).toBeNull()
    expect(runtime.has('api')).toBe(true)
    expect(runtime.has('other')).toBe(false)
    await runtime.stop()
    expect(runtime.latestEnvironment('api')).toBeNull()
  })

  test("a replay's environment is not the latest one of its function", async () => {
    const { invoke, runtime } = await setup()
    await invoke({ environment: deployedEnv({ A: '1' }) })
    await invoke({
      environmentId: 'dev-replay',
      environment: deployedEnv({ A: 'replayed' }),
    })
    expect(runtime.latestEnvironment('api')).toEqual(deployedEnv({ A: '1' }))
  })
})

const posix = process.platform === 'win32' ? test.skip : test

// A module-scope helper process, the way handlers keep a sidecar between invocations.
const SIDECAR_HANDLER = [
  "import { spawn } from 'node:child_process'",
  'let sidecar = null',
  'export const handler = async (event) => {',
  "  sidecar ??= spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
  '  if (event.exit) process.exit(event.exit)',
  '  if (event.sleepMs) await new Promise((resolve) => setTimeout(resolve, event.sleepMs))',
  '  return { pid: process.pid, sidecar: sidecar.pid }',
  '}',
  '',
].join('\n')

describe('the processes a handler starts', () => {
  posix('end when the session stops', async () => {
    const { invoke, runtime } = await setup({
      files: { 'handler.mjs': SIDECAR_HANDLER },
    })
    const { sidecar } = body(await invoke())
    expect(alive(sidecar)).toBe(true)
    await runtime.stop()
    expect(await waitFor(() => !alive(sidecar))).toBe(true)
  })

  posix('end when a reload replaces their worker', async () => {
    const { invoke, runtime } = await setup({
      files: { 'handler.mjs': SIDECAR_HANDLER },
    })
    const { sidecar } = body(await invoke())
    runtime.reload(['api'])
    expect(await waitFor(() => !alive(sidecar))).toBe(true)
  })

  posix('end when their invocation times out', async () => {
    const { invoke } = await setup({
      files: { 'handler.mjs': SIDECAR_HANDLER },
    })
    const { sidecar } = body(await invoke())
    expect(
      await invoke({
        deadlineMs: Date.now() + 300,
        event: { sleepMs: 60_000 },
      }),
    ).toMatchObject({ errorType: 'Sandbox.Timedout' })
    expect(await waitFor(() => !alive(sidecar))).toBe(true)
  })

  posix('end when their worker exits on its own', async () => {
    const { invoke } = await setup({
      files: { 'handler.mjs': SIDECAR_HANDLER },
    })
    const { sidecar } = body(await invoke())
    expect(await invoke({ event: { exit: 3 } })).toMatchObject({
      errorType: 'Runtime.ExitError',
    })
    expect(await waitFor(() => !alive(sidecar))).toBe(true)
  })

  posix('end with the exit hook', async () => {
    const { invoke, processRef } = await setup({
      files: { 'handler.mjs': SIDECAR_HANDLER },
    })
    const { sidecar } = body(await invoke())
    processRef.emit('exit')
    expect(await waitFor(() => !alive(sidecar))).toBe(true)
  })

  posix(
    'Ctrl+C in the terminal reaches only the CLI: a busy handler runs until the session stops it',
    async () => {
      const dir = tempDir()
      const serviceDir = write(path.join(dir, 'svc'), {
        'handler.mjs': HANDLER('v1'),
      })
      const moduleUrl = (file) =>
        pathToFileURL(
          path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            '../../../../../../../lib/plugins/aws/dev/local',
            file,
          ),
        ).href
      // Stands in for the CLI: it runs the laptop runtime, starts a long invocation, and on SIGINT
      // checks the worker, then stops the runtime the way the session does.
      write(dir, {
        'cli.mjs': [
          `import { createLocalRuntime } from ${JSON.stringify(moduleUrl('runtime.js'))}`,
          `import { nodeAdapter } from ${JSON.stringify(moduleUrl('adapters/node.js'))}`,
          "const say = (value) => process.stdout.write(JSON.stringify(value) + '\\n')",
          'const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }',
          'let starts = 0',
          'const runtime = createLocalRuntime({',
          '  serverless: { pluginManager: { plugins: [] } },',
          `  serviceDir: ${JSON.stringify(serviceDir)},`,
          "  functions: new Map([['api', { key: 'api', adapter: nodeAdapter, runtime: 'nodejs24.x', timeout: 60,",
          "    config: { handler: 'handler.handler' },",
          '    local: { available: true, command: process.execPath, version: process.versions.node } }]]),',
          '  output: { start: () => { starts += 1; if (starts === 2) say({ running: true }) }, log() {}, end() {},',
          '    workerExited: (details) => say({ workerExited: details.signal ?? details.code }) },',
          '  logger: { debug() {}, warning() {} },',
          '  timers: { setTimeout, clearTimeout },',
          `  machineEnv: { PATH: process.env.PATH, HOME: ${JSON.stringify(serviceDir)} },`,
          `  tmpRoot: ${JSON.stringify(dir)},`,
          '})',
          'await runtime.start()',
          "const environment = { AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'ASIAFUNCTIONROLE0001', AWS_SECRET_ACCESS_KEY: 's' }",
          "const request = (id, event) => ({ functionKey: 'api', environmentId: 'env-1', environment,",
          "  headers: { 'lambda-runtime-aws-request-id': id, 'lambda-runtime-deadline-ms': String(Date.now() + 60_000) },",
          '  event: Buffer.from(JSON.stringify(event)) })',
          "const first = JSON.parse((await runtime.invoke(request('req-1', {}))).body.toString())",
          "const running = runtime.invoke(request('req-2', { sleepMs: 30_000 }))",
          "process.on('SIGINT', async () => {",
          '  await new Promise((resolve) => setTimeout(resolve, 500))',
          '  const aliveAfterInterrupt = alive(first.pid)',
          '  await runtime.stop()',
          '  const reply = await running',
          '  say({ aliveAfterInterrupt, kind: reply.kind, errorType: reply.errorType,',
          '    message: JSON.parse(reply.body.toString()).errorMessage })',
          '  process.exit(0)',
          '})',
          '',
        ].join('\n'),
      })
      const cli = spawn(process.execPath, [path.join(dir, 'cli.mjs')], {
        cwd: dir,
        env: baseEnv(),
        // Its own process group, like a CLI in the foreground of a terminal.
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      cli.stdout.on('data', (chunk) => {
        stdout += chunk
      })
      cli.stderr.on('data', (chunk) => {
        stderr += chunk
      })
      const exited = new Promise((resolve) => cli.on('exit', resolve))
      try {
        expect(
          await waitFor(() => stdout.includes('"running":true'), 20_000),
        ).toBe(true)
        // What a terminal does on Ctrl+C: SIGINT to its whole foreground process group.
        process.kill(-cli.pid, 'SIGINT')
        await exited
        const said = stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        expect(said).not.toContainEqual(
          expect.objectContaining({ workerExited: expect.anything() }),
        )
        expect(said[said.length - 1]).toEqual({
          aliveAfterInterrupt: true,
          kind: 'error',
          errorType: 'Runtime.ExitError',
          message:
            'RequestId: req-2 Error: Runtime exited with error: signal: SIGTERM',
        })
      } catch (error) {
        error.message += `\nCLI stderr: ${stderr}`
        throw error
      } finally {
        try {
          process.kill(-cli.pid, 'SIGKILL')
        } catch {
          // Already gone.
        }
      }
    },
  )
})
