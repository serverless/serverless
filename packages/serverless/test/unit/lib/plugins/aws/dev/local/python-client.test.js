import { afterEach, describe, expect, jest, test } from '@jest/globals'
import { execFileSync, spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'fs'
import path from 'path'
import { createRuntimeApi } from '../../../../../../../lib/plugins/aws/dev/local/runtime-api.js'
import {
  CLIENT_FILES,
  clientPath,
} from '../../../../../../../lib/plugins/aws/dev/local/paths.js'
import {
  alive,
  baseEnv,
  cleanTempDirs,
  collect,
  exitWithin,
  invocation,
  killChildren,
  killPid,
  PARENT_PID,
  pythonCommand,
  sleep,
  spawnTracked,
  startWithShortLivedParent,
  tempDir,
  waitFor,
  workerId,
  write,
} from './helpers.js'

jest.setTimeout(60_000)

const python = pythonCommand()
const withPython = python ? describe : describe.skip
/** Whether an interpreter runs in a virtual environment or a named conda environment. */
const IN_ENVIRONMENT =
  'import os, sys; print(sys.prefix != sys.base_prefix or (os.path.isdir(os.path.join(sys.prefix, "conda-meta")) and not os.path.isdir(os.path.join(sys.prefix, "envs"))))'
const inEnvironment = (command) =>
  execFileSync(command, ['-c', IN_ENVIRONMENT], {
    encoding: 'utf8',
    env: baseEnv(),
    windowsHide: true,
  }).trim() === 'True'
/**
 * An interpreter outside any environment: `python` itself, or, for a virtual environment's
 * interpreter first on PATH, its base. Null when that one is in an environment too.
 */
const baseInterpreterOf = (command) => {
  const base = inEnvironment(command)
    ? execFileSync(
        command,
        ['-c', 'import sys; print(getattr(sys, "_base_executable", "") or "")'],
        { encoding: 'utf8', env: baseEnv(), windowsHide: true },
      ).trim()
    : command
  return base && !inEnvironment(base) ? base : null
}
let api
afterEach(async () => {
  await killChildren()
  await api?.close()
  api = null
  cleanTempDirs()
})

const clientArgs = ({
  dir,
  handler,
  deployedRuntime,
  parentPid,
  ownGroup,
  fallbackPaths,
}) => [
  '-u',
  clientPath(CLIENT_FILES.python),
  JSON.stringify({
    handler,
    taskRoot: dir,
    serviceDir: dir,
    ...(fallbackPaths !== undefined && { fallbackPaths }),
    ...(deployedRuntime !== undefined && { deployedRuntime }),
    ...(parentPid !== undefined && { parentPid }),
    ...(ownGroup !== undefined && { ownGroup }),
  }),
]
const lambdaEnv = (channel, env = {}) => ({
  ...baseEnv(),
  AWS_LAMBDA_RUNTIME_API: channel.address,
  AWS_LAMBDA_FUNCTION_NAME: 'svc-dev-py',
  AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
  AWS_LAMBDA_FUNCTION_MEMORY_SIZE: '512',
  AWS_LAMBDA_LOG_GROUP_NAME: '/aws/lambda/svc-dev-py',
  AWS_LAMBDA_LOG_STREAM_NAME: '2026/10/01/[$LATEST]def',
  ...env,
})
const startApi = async () => {
  if (!api) {
    api = createRuntimeApi()
    await api.listen()
  }
  return api
}
const startClient = async ({
  files = {},
  dir = write(tempDir(), files),
  handler = 'handler.handler',
  deployedRuntime,
  env,
  fallbackPaths,
  command = python,
}) => {
  const channel = (await startApi()).channel(workerId())
  const child = spawnTracked(
    command,
    clientArgs({ dir, handler, deployedRuntime, fallbackPaths }),
    {
      cwd: dir,
      env: lambdaEnv(channel, env),
    },
  )
  const invoke = async (options) =>
    collect(await channel.dispatch(invocation(options)))
  return { channel, child, dir, invoke }
}
const json = (reply) => JSON.parse(reply.text)
const posixOnly = process.platform === 'win32' ? test.skip : test

withPython('the Python runtime client', () => {
  test('runs a handler in a package path and returns its result as JSON', async () => {
    const { invoke } = await startClient({
      files: {
        'src/__init__.py': '',
        'src/app.py':
          'def handler(event, context):\n    return {"echo": event["value"]}\n',
      },
      handler: 'src/app.handler',
    })
    const reply = await invoke({ event: { value: 7 } })
    expect(reply.kind).toBe('response')
    expect(reply.contentType).toBe('application/json')
    expect(json(reply)).toEqual({ echo: 7 })
  })

  const requirementsFiles = {
    'handler.py':
      'import shadow, only_fallback\n' +
      'def handler(event, context):\n' +
      '    return {"shadow": shadow.WHERE, "only": only_fallback.WHERE}\n',
    // Stands for .serverless/requirements, built for the function.
    'requirements/shadow.py': 'WHERE = "requirements"\n',
    'requirements/only_fallback.py': 'WHERE = "requirements"\n',
  }

  test('without a virtual environment, the requirements built for the function win over packages outside one', async () => {
    // A base interpreter, also when the one first on PATH is a virtual environment's.
    const base = baseInterpreterOf(python)
    if (!base) return
    const dir = write(tempDir(), {
      ...requirementsFiles,
      // Stands for packages installed outside a virtual environment.
      'outside/shadow.py': 'WHERE = "outside"\n',
    })
    const { invoke } = await startClient({
      command: base,
      dir,
      env: { PYTHONPATH: path.join(dir, 'outside') },
      fallbackPaths: [path.join(dir, 'requirements')],
    })
    expect(json(await invoke({ event: {} }))).toEqual({
      shadow: 'requirements',
      only: 'requirements',
    })
  })

  test('in a virtual environment, its own packages win over the requirements, which fill in what it lacks', async () => {
    const dir = write(tempDir(), {
      ...requirementsFiles,
      'handler.py':
        'import shadow, only_fallback, editable\n' +
        'def handler(event, context):\n' +
        '    return {"shadow": shadow.WHERE, "only": only_fallback.WHERE, "editable": editable.WHERE}\n',
      'requirements/editable.py': 'WHERE = "requirements"\n',
      // Stands for a package installed editable into the environment: its .pth names this path.
      'src/editable.py': 'WHERE = "environment"\n',
    })
    const venv = path.join(dir, '.venv')
    execFileSync(python, ['-m', 'venv', '--without-pip', venv], {
      env: baseEnv(),
      windowsHide: true,
    })
    const venvPython =
      process.platform === 'win32'
        ? path.join(venv, 'Scripts', 'python.exe')
        : path.join(venv, 'bin', 'python')
    const sitePackages = execFileSync(
      venvPython,
      ['-c', 'import sysconfig; print(sysconfig.get_paths()["purelib"])'],
      { encoding: 'utf8', env: baseEnv(), windowsHide: true },
    ).trim()
    write(sitePackages, {
      'shadow.py': 'WHERE = "environment"\n',
      '__editable__.editable.pth': `${path.join(dir, 'src')}\n`,
    })
    const channel = (await startApi()).channel(workerId())
    spawnTracked(
      venvPython,
      clientArgs({
        dir,
        handler: 'handler.handler',
        fallbackPaths: [path.join(dir, 'requirements')],
      }),
      { cwd: dir, env: lambdaEnv(channel) },
    )
    const reply = collect(await channel.dispatch(invocation({ event: {} })))
    expect(json(await reply)).toEqual({
      shadow: 'environment',
      only: 'requirements',
      editable: 'environment',
    })
  })

  test('a named conda environment counts as an environment, its base does not: the requirements go after its own entries', () => {
    const prefix = tempDir()
    const index = () =>
      execFileSync(
        python,
        [
          // No bytecode next to the client file.
          '-B',
          '-c',
          [
            'import importlib.util, os, site, sys',
            'spec = importlib.util.spec_from_file_location("client", sys.argv[1])',
            'client = importlib.util.module_from_spec(spec)',
            'spec.loader.exec_module(client)',
            'prefix = sys.argv[2]',
            'sys.prefix = sys.base_prefix = prefix',
            'env_site = site.getsitepackages([prefix])[-1]',
            'sys.path[:] = [sys.argv[3], os.path.join(prefix, "lib", "python3"), site.getusersitepackages(), env_site, sys.argv[4]]',
            'print(client.requirements_index())',
          ].join('\n'),
          clientPath(CLIENT_FILES.python),
          prefix,
          path.join(prefix, 'task'),
          // A path the environment's .pth adds.
          path.join(tempDir(), 'src'),
        ],
        { encoding: 'utf8', env: baseEnv(), windowsHide: true },
      ).trim()
    expect(index()).toBe('1')
    write(prefix, { 'conda-meta/history': '' })
    expect(index()).toBe('5')
    // Conda's base environment holds the other environments: the requirements come first there.
    mkdirSync(path.join(prefix, 'envs'))
    expect(index()).toBe('1')
  })

  test('passes the Lambda context and clamps the remaining time at zero', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.py': [
          'def handler(event, context):',
          '    client_context = context.client_context',
          '    return {',
          '        "aws_request_id": context.aws_request_id,',
          '        "invoked_function_arn": context.invoked_function_arn,',
          '        "function_name": context.function_name,',
          '        "function_version": context.function_version,',
          '        "memory_limit_in_mb": context.memory_limit_in_mb,',
          '        "log_group_name": context.log_group_name,',
          '        "log_stream_name": context.log_stream_name,',
          '        "identity_id": context.identity.cognito_identity_id,',
          '        "identity_pool_id": context.identity.cognito_identity_pool_id,',
          '        "client_context": client_context and client_context.custom,',
          '        "installation_id": client_context and client_context.client and client_context.client.installation_id,',
          '        "tenant_id": context.tenant_id,',
          '        "remaining": context.get_remaining_time_in_millis(),',
          '    }',
          '',
        ].join('\n'),
      },
    })
    const live = json(
      await invoke({
        requestId: 'req-py',
        deadlineMs: Date.now() + 20_000,
        headers: {
          'lambda-runtime-client-context':
            '{"custom":{"a":1},"client":{"installation_id":"inst-1"}}',
          'lambda-runtime-aws-tenant-id': 'tenant-a',
        },
      }),
    )
    expect(live).toMatchObject({
      aws_request_id: 'req-py',
      invoked_function_arn:
        'arn:aws:lambda:us-east-1:123456789012:function:svc-dev-api',
      function_name: 'svc-dev-py',
      function_version: '$LATEST',
      memory_limit_in_mb: '512',
      log_group_name: '/aws/lambda/svc-dev-py',
      log_stream_name: '2026/10/01/[$LATEST]def',
      identity_id: null,
      identity_pool_id: null,
      client_context: { a: 1 },
      installation_id: 'inst-1',
      tenant_id: 'tenant-a',
    })
    expect(live.remaining).toBeGreaterThan(10_000)
    expect(live.remaining).toBeLessThanOrEqual(20_000)
    const late = json(
      await invoke({
        deadlineMs: Date.now() - 1000,
        headers: {
          'lambda-runtime-cognito-identity':
            '{"cognitoIdentityId":"id-1","cognitoIdentityPoolId":"pool-1"}',
        },
      }),
    )
    expect(late).toMatchObject({
      remaining: 0,
      client_context: null,
      identity_id: 'id-1',
      identity_pool_id: 'pool-1',
      tenant_id: null,
    })
  })

  test('sets _X_AMZN_TRACE_ID per invocation and removes it when the invocation has none', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.py':
          'import os\n\ndef handler(event, context):\n    return {"trace": os.environ.get("_X_AMZN_TRACE_ID")}\n',
      },
    })
    expect(
      json(
        await invoke({ headers: { 'lambda-runtime-trace-id': 'Root=1-abc' } }),
      ),
    ).toEqual({ trace: 'Root=1-abc' })
    expect(json(await invoke())).toEqual({ trace: null })
  })

  test('keeps module state between invocations of one process', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.py':
          'count = 0\n\ndef handler(event, context):\n    global count\n    count += 1\n    return {"n": count}\n',
      },
    })
    expect(json(await invoke())).toEqual({ n: 1 })
    expect(json(await invoke())).toEqual({ n: 2 })
  })

  test("a raised exception becomes Lambda's error body, with this machine's paths shown as /var/task", async () => {
    const { invoke, dir } = await startClient({
      files: {
        'handler.py':
          'def handler(event, context):\n    raise ValueError("bad input")\n',
      },
    })
    const reply = await invoke({ requestId: 'req-err' })
    expect(reply).toMatchObject({ kind: 'error', errorType: 'ValueError' })
    const body = json(reply)
    expect(body).toMatchObject({
      errorMessage: 'bad input',
      errorType: 'ValueError',
      requestId: 'req-err',
    })
    expect(
      body.stackTrace.some((line) =>
        line.includes('File "/var/task/handler.py", line 2, in handler'),
      ),
    ).toBe(true)
    expect(body.stackTrace.some((line) => line.includes(dir))).toBe(false)
    expect(
      body.stackTrace.some((line) => line.includes('python_client.py')),
    ).toBe(false)
  })

  test('rewrites the code root only where a path starts, in the message and the trace', async () => {
    const dir = tempDir()
    write(dir, {
      'handler.py': `def handler(event, context):\n    raise FileNotFoundError(${JSON.stringify(`copy /backup${dir}/a.txt of ${dir}/a.txt or ${dir}x/a.txt`)})\n`,
    })
    const { invoke } = await startClient({ dir })
    const body = json(await invoke())
    expect(body.errorMessage).toBe(
      `copy /backup${dir}/a.txt of /var/task/a.txt or ${dir}x/a.txt`,
    )
    expect(
      body.stackTrace.some((line) =>
        line.includes('File "/var/task/handler.py", line 2'),
      ),
    ).toBe(true)
  })

  test('shows a code root reached through a symbolic link, and its real path, as /var/task', async () => {
    const real = write(tempDir(), {
      'handler.py':
        'import os\n\ndef handler(event, context):\n    raise RuntimeError(os.path.realpath(__file__))\n',
    })
    const link = path.join(tempDir(), 'linked-project')
    symlinkSync(real, link, 'junction')
    const { invoke } = await startClient({ dir: link })
    const body = json(await invoke())
    expect(body.errorMessage).toBe('/var/task/handler.py')
    expect(
      body.stackTrace.some((line) =>
        line.includes('File "/var/task/handler.py", line 4'),
      ),
    ).toBe(true)
    const shown = [body.errorMessage, ...body.stackTrace].join('\n')
    expect(shown).not.toContain(real)
    expect(shown).not.toContain(link)
    expect(shown).not.toContain('/private/var/task')
  })

  test('serialises Decimal, and reports an unserialisable result as Runtime.MarshalError', async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.py': [
          'from decimal import Decimal',
          '',
          'def handler(event, context):',
          '    if event.get("bad"):',
          '        return {"values": {1, 2}}',
          '    return {"whole": Decimal("3"), "part": Decimal("1.5")}',
          '',
        ].join('\n'),
      },
    })
    expect(json(await invoke())).toEqual({ whole: 3, part: 1.5 })
    const bad = await invoke({ event: { bad: true } })
    expect(bad).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.MarshalError',
    })
    expect(json(bad).errorMessage).toMatch(/^Unable to marshal response: .*set/)
    expect(json(await invoke())).toEqual({ whole: 3, part: 1.5 })
    expect(child.exitCode).toBeNull()
  })

  test('writes a Decimal as its own digits, the way the deployed runtime does', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.py': [
          'from decimal import Decimal',
          '',
          'def handler(event, context):',
          '    return {',
          '        "a": Decimal("1.10"),',
          // More digits than a float keeps.
          '        "b": Decimal("0." + "1" * 30),',
          '        "c": Decimal("3.0"),',
          '        "d": Decimal("1E+2"),',
          '        "e": Decimal("NaN"),',
          '        "f": Decimal("-Infinity"),',
          '        "g": Decimal("-0"),',
          '        "h": [Decimal("1" * 20 + ".5")],',
          '    }',
          '',
        ].join('\n'),
      },
    })
    // A deployed function returning the same dict answers exactly this text.
    expect((await invoke()).text).toBe(
      `{"a": 1.10, "b": 0.${'1'.repeat(30)}, "c": 3.0, "d": 1E+2, "e": NaN, "f": -Infinity, "g": -0, "h": [${'1'.repeat(20)}.5]}`,
    )
  })

  test('returns text the way the deployed runtime does: as it is from Python 3.12 on, escaped before', async () => {
    // A deployed function returning {"a": 1, "text": "zażółć"} answers exactly these bytes:
    // python3.13 '{"a": 1, "text": "zażółć"}', python3.11 '{"a": 1, "text": "za\\u017c…"}'.
    const files = {
      'handler.py':
        'def handler(event, context):\n    return {"a": 1, "text": "za\u017c\u00f3\u0142\u0107"}\n',
    }
    const current = await startClient({ files, deployedRuntime: 'python3.13' })
    expect((await current.invoke()).text).toBe('{"a": 1, "text": "zażółć"}')
    const older = await startClient({ files, deployedRuntime: 'python3.11' })
    expect((await older.invoke()).text).toBe(
      '{"a": 1, "text": "za\\u017c\\u00f3\\u0142\\u0107"}',
    )
  })

  test('returns bytes as they are, the way Lambda does', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.py':
          'def handler(event, context):\n    return b"\\x00raw bytes"\n',
      },
    })
    const reply = await invoke()
    expect(reply.kind).toBe('response')
    expect(reply.contentType).toBe('application/unknown')
    expect(reply.body).toEqual(Buffer.from('\u0000raw bytes', 'latin1'))
  })

  test('an event that is not JSON is a Runtime.UnmarshalError, and the process serves on', async () => {
    const { channel, invoke, child } = await startClient({
      files: { 'handler.py': 'def handler(event, context):\n    return 1\n' },
    })
    const reply = await collect(
      await channel.dispatch({
        ...invocation(),
        event: Buffer.from('not json'),
      }),
    )
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.UnmarshalError',
    })
    expect(json(reply).errorMessage).toMatch(/^Unable to unmarshal input: /)
    expect((await invoke()).text).toBe('1')
    expect(child.exitCode).toBeNull()
  })

  test('an empty event body is a Runtime.UnmarshalError too; the handler is not entered', async () => {
    const { channel, invoke } = await startClient({
      files: {
        'handler.py':
          'def handler(event, context):\n    return {"entered": event}\n',
      },
    })
    const reply = await collect(
      await channel.dispatch({ ...invocation(), event: Buffer.alloc(0) }),
    )
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.UnmarshalError',
    })
    expect(json(reply).errorMessage).toBe(
      'Unable to unmarshal input: Expecting value: line 1 column 1 (char 0)',
    )
    expect(json(await invoke())).toEqual({ entered: {} })
  })

  test('an exception that cannot be shown as text still answers the invocation', async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.py': [
          'class Unprintable(Exception):',
          '    def __str__(self):',
          '        raise RuntimeError("no text")',
          '',
          'def handler(event, context):',
          '    if event.get("ok"):',
          '        return "fine"',
          '    raise Unprintable()',
          '',
        ].join('\n'),
      },
    })
    const reply = await invoke()
    expect(reply).toMatchObject({ kind: 'error', errorType: 'Unprintable' })
    expect(json(reply).errorMessage).toBe('<unprintable Unprintable object>')
    expect(json(await invoke({ event: { ok: true } }))).toBe('fine')
    expect(child.exitCode).toBeNull()
  })

  test("prints records of the root logger the way Lambda's handler does", async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.py': [
          'import logging',
          '',
          'logger = logging.getLogger()',
          'logger.setLevel(logging.INFO)',
          '',
          'def handler(event, context):',
          '    logger.info("hello %s", "there")',
          '    logging.getLogger("app").debug("hidden")',
          '    return 1',
          '',
        ].join('\n'),
      },
    })
    await invoke()
    // The child's stdout and the HTTP reply travel separately: wait for the line to arrive.
    // Python's text stdout ends lines with CRLF on Windows; the CLI splits on either.
    expect(
      await waitFor(() => /\[INFO\]\thello there\r?\n/.test(child.stdoutText)),
    ).toBe(true)
    expect(child.stdoutText).not.toContain('hidden')
  })

  test.each([
    [
      'a missing module',
      { 'other.py': '' },
      'missing.handler',
      'Runtime.ImportModuleError',
      "Unable to import module 'missing': No module named 'missing'",
    ],
    [
      'a missing module in a package path, named as the handler names it',
      { 'src/__init__.py': '' },
      'src/missing.handler',
      'Runtime.ImportModuleError',
      "Unable to import module 'src/missing': No module named 'src.missing'",
    ],
    [
      'a missing function',
      { 'handler.py': 'x = 1\n' },
      'handler.handler',
      'Runtime.HandlerNotFound',
      "Handler 'handler' missing on module 'handler'",
    ],
    [
      'a handler that is not callable',
      { 'handler.py': 'handler = 1\n' },
      'handler.handler',
      'Runtime.HandlerNotFound',
      "Handler 'handler' missing on module 'handler'",
    ],
    [
      'a handler string without a function',
      { 'handler.py': '' },
      'handler',
      'Runtime.MalformedHandlerName',
      "Bad handler 'handler': expected module.function",
    ],
    [
      'a syntax error',
      { 'handler.py': 'def handler(:\n' },
      'handler.handler',
      'Runtime.UserCodeSyntaxError',
      "Syntax error in module 'handler'",
    ],
    [
      'an error while importing',
      { 'handler.py': 'raise RuntimeError("init failed")\n' },
      'handler.handler',
      'RuntimeError',
      'init failed',
    ],
  ])(
    'reports %s as an init error and exits',
    async (name, files, handler, errorType, message) => {
      const { invoke, child } = await startClient({ files, handler })
      const reply = await invoke()
      expect(reply).toMatchObject({ kind: 'init_error', errorType })
      const body = json(reply)
      expect(body).toMatchObject({ errorType, requestId: '' })
      expect(body.errorMessage).toContain(message)
      expect(Array.isArray(body.stackTrace)).toBe(true)
      expect((await child.exited).code).toBe(1)
    },
  )

  test('a syntax error without a line number names only the file', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.py':
          'raise SyntaxError("generated", (__file__, None, None, None))\n',
      },
    })
    const body = json(await invoke())
    expect(body.errorType).toBe('Runtime.UserCodeSyntaxError')
    expect(body.stackTrace).toEqual(['  File "/var/task/handler.py"\n'])
  })

  test("third-party frames keep this machine's path, also where the interpreter keeps packages inside its standard library", async () => {
    const base = write(tempDir(), {
      'site-packages/thirdparty/__init__.py': '',
      'site-packages/thirdparty/core.py':
        'def boom():\n    raise ValueError("from a package")\n',
    })
    const packages = path.join(base, 'site-packages')
    const { invoke } = await startClient({
      files: {
        'handler.py': [
          'import os',
          'import sysconfig',
          '',
          'import thirdparty.core',
          '',
          '# Packages inside the standard library directory, the way pyenv and python.org builds',
          '# keep them: compiled under that path, without writing there.',
          'stdlib = sysconfig.get_paths()["stdlib"]',
          'bundled = {}',
          'for where in ("site-packages", "dist-packages"):',
          '    scope = {}',
          '    source = "def boom():\\n    raise ValueError(\'bundled\')\\n"',
          '    exec(compile(source, os.path.join(stdlib, where, "bundled", "core.py"), "exec"), scope)',
          '    bundled[where] = scope["boom"]',
          '',
          'def handler(event, context):',
          '    if event.get("where"):',
          '        bundled[event["where"]]()',
          '    thirdparty.core.boom()',
          '',
        ].join('\n'),
      },
      env: { PYTHONPATH: packages },
    })
    const installed = json(await invoke())
    expect(
      installed.stackTrace.some((line) =>
        line.includes('File "/var/task/handler.py", line 19, in handler'),
      ),
    ).toBe(true)
    expect(
      installed.stackTrace.some((line) =>
        line.includes(
          `File "${path.join(packages, 'thirdparty', 'core.py')}", line 2, in boom`,
        ),
      ),
    ).toBe(true)
    for (const where of ['site-packages', 'dist-packages']) {
      const body = json(await invoke({ event: { where } }))
      // A frame left on this machine's path keeps this machine's separators.
      const frame = body.stackTrace.find((line) =>
        line.includes(
          `${path.join(where, 'bundled', 'core.py')}", line 2, in boom`,
        ),
      )
      expect(frame).toBeDefined()
      expect(frame).not.toContain('/var/lang/')
    }
  })

  test("an init error shows where the code failed, with this machine's paths as /var/task", async () => {
    const syntax = await startClient({
      files: { 'handler.py': 'x = 1\ndef handler(:\n' },
    })
    const syntaxBody = json(await syntax.invoke())
    expect(syntaxBody.errorType).toBe('Runtime.UserCodeSyntaxError')
    // A deployed python3.13 function whose module misses a colon answers the stackTrace
    // ["  File \"/var/task/syntax_py.py\" Line 1\n    def handler(event, context)\n"].
    expect(syntaxBody.stackTrace).toEqual([
      '  File "/var/task/handler.py" Line 2\n    def handler(:\n',
    ])

    const raised = await startClient({
      files: { 'handler.py': 'x = 1\nraise RuntimeError("init failed")\n' },
    })
    const raisedBody = json(await raised.invoke())
    expect(
      raisedBody.stackTrace.some((line) =>
        line.includes('File "/var/task/handler.py", line 2, in <module>'),
      ),
    ).toBe(true)
    // The import machinery's frames stay, as in Lambda, under Lambda's standard library path.
    expect(
      raisedBody.stackTrace.some((line) =>
        /^ {2}File "\/var\/lang\/lib\/python3\.\d+\/importlib\/__init__\.py", line \d+, in import_module\n/.test(
          line,
        ),
      ),
    ).toBe(true)

    const imported = await startClient({
      files: {
        'pkg/__init__.py': '',
        'handler.py':
          'from pkg import missing\n\ndef handler(event, context):\n    return 1\n',
      },
    })
    const importedBody = json(await imported.invoke())
    expect(importedBody.errorType).toBe('Runtime.ImportModuleError')
    expect(importedBody.errorMessage).toBe(
      "Unable to import module 'handler': cannot import name 'missing' from 'pkg' (/var/task/pkg/__init__.py)",
    )

    for (const { dir, body } of [
      { dir: syntax.dir, body: syntaxBody },
      { dir: raised.dir, body: raisedBody },
      { dir: imported.dir, body: importedBody },
    ]) {
      const shown = [body.errorMessage, ...body.stackTrace].join('\n')
      expect(shown).not.toContain(dir)
      expect(shown).not.toContain('python_client.py')
    }
  })

  test('exits when the Runtime API goes away', async () => {
    const { invoke, child } = await startClient({
      files: { 'handler.py': 'def handler(event, context):\n    return 1\n' },
    })
    await invoke()
    await api.close()
    api = null
    expect(await exitWithin(child, 10_000)).toEqual({ code: 0, signal: null })
  })

  test('exits when the Runtime API goes away while its handler never returns', async () => {
    const { channel, child, dir } = await startClient({
      files: {
        // Blocks the main thread, so nothing but a liveness check can notice the CLI is gone.
        'handler.py': [
          'import threading',
          '',
          'def handler(event, context):',
          "    with open('started', 'w') as started:",
          "        started.write('1')",
          '    threading.Event().wait()',
          '',
        ].join('\n'),
      },
    })
    channel.dispatch(invocation()).catch(() => {})
    expect(
      await waitFor(() => existsSync(path.join(dir, 'started')), 10_000),
    ).toBe(true)
    await api.close()
    api = null
    // Two refused connects 2 s apart; on Windows a refused connect itself takes a while to report.
    expect(await exitWithin(child, 15_000)).toEqual({ code: 0, signal: null })
  })

  test('keeps running while the CLI is too busy to answer', async () => {
    const { channel, child, dir } = await startClient({
      files: {
        'handler.py': [
          'import threading',
          '',
          'def handler(event, context):',
          "    with open('started', 'w') as started:",
          "        started.write('1')",
          '    threading.Event().wait()',
          '',
        ].join('\n'),
      },
    })
    channel.dispatch(invocation()).catch(() => {})
    expect(
      await waitFor(() => existsSync(path.join(dir, 'started')), 10_000),
    ).toBe(true)
    // The Runtime API runs in this process: blocking it for longer than two checks leaves the
    // listener open and unanswered, the way a CLI under load is.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5_000)
    expect(await exitWithin(child, 3_000)).toBe('still running')
  })

  test('keeps running while every connect to the CLI times out: a timeout is never gone', async () => {
    const channel = (await startApi()).channel(workerId())
    const dir = write(tempDir(), {
      'handler.py': [
        'import threading',
        '',
        'def handler(event, context):',
        "    with open('started', 'w') as started:",
        "        started.write('1')",
        '    threading.Event().wait()',
        '',
      ].join('\n'),
    })
    // Whether a connect to a busy listener times out depends on the operating system (a full
    // accept queue can refuse or accept it instead), so this hook makes the client's liveness
    // connect time out: once the handler has started, it waits for the connect's timeout and
    // raises it. The Runtime API calls are real.
    const hookDir = write(tempDir(), {
      'sitecustomize.py': [
        'import os',
        'import socket',
        'import sys',
        'import time',
        '',
        '_create_connection = socket.create_connection',
        '',
        '',
        'def create_connection(address, timeout=None, *args, **kwargs):',
        "    if os.path.exists('started') and sys._getframe(1).f_code.co_name == 'runtime_api_refuses':",
        "        with open('stalled', 'a') as stalled:",
        "            stalled.write('1')",
        '        time.sleep(timeout)',
        "        raise socket.timeout('timed out')",
        '    return _create_connection(address, timeout, *args, **kwargs)',
        '',
        '',
        'socket.create_connection = create_connection',
        '',
      ].join('\n'),
    })
    const child = spawnTracked(
      python,
      clientArgs({ dir, handler: 'handler.handler' }),
      { cwd: dir, env: lambdaEnv(channel, { PYTHONPATH: hookDir }) },
    )
    channel.dispatch(invocation()).catch(() => {})
    expect(
      await waitFor(() => existsSync(path.join(dir, 'started')), 10_000),
    ).toBe(true)
    // A check every 2 s, each a connect that times out (after 1 s, 3 s on Windows): two refused
    // in a row would have ended it.
    expect(await exitWithin(child, 9_000)).toBe('still running')
    expect(
      readFileSync(path.join(dir, 'stalled'), 'utf8').length,
    ).toBeGreaterThanOrEqual(2)
  })

  test('exits when the Runtime API cannot be reached at all', async () => {
    const channel = (await startApi()).channel(workerId())
    await api.close()
    api = null
    const dir = write(tempDir(), {
      'handler.py': 'def handler(event, context):\n    return 1\n',
    })
    const child = spawnTracked(
      python,
      clientArgs({ dir, handler: 'handler.handler' }),
      { cwd: dir, env: lambdaEnv(channel) },
    )
    expect(await exitWithin(child, 10_000)).toEqual({ code: 0, signal: null })
  })

  posixOnly(
    'Ctrl+C in the terminal ends it quietly, without a traceback',
    async () => {
      const { invoke, child } = await startClient({
        files: { 'handler.py': 'def handler(event, context):\n    return 1\n' },
      })
      await invoke()
      child.kill('SIGINT')
      expect(await exitWithin(child, 10_000)).toEqual({
        code: null,
        signal: 'SIGINT',
      })
      // The process can exit before its pipes drain: read stderr only once both have ended.
      expect(
        await waitFor(
          () => child.stdout.readableEnded && child.stderr.readableEnded,
        ),
      ).toBe(true)
      expect(child.stderrText).toBe('')
    },
  )

  posixOnly('exits when its parent process is gone', async () => {
    const channel = (await startApi()).channel(workerId())
    const dir = write(tempDir(), {
      'handler.py': 'def handler(event, context):\n    return 1\n',
    })
    // The parent stays long enough for the client to start and answer, even on a loaded machine,
    // so what ends the client is its parent going away, not a parent gone before it started.
    let served = false
    channel.dispatch(invocation()).then((reply) => {
      served = reply.kind === 'response'
    })
    const pid = await startWithShortLivedParent({
      command: python,
      args: clientArgs({
        dir,
        handler: 'handler.handler',
        parentPid: PARENT_PID,
      }),
      cwd: dir,
      env: lambdaEnv(channel),
      parentLifetimeMs: 3_000,
    })
    try {
      expect(served).toBe(true)
      expect(await waitFor(() => !alive(pid), 6_000)).toBe(true)
    } finally {
      killPid(pid)
    }
  })

  posixOnly(
    'exits when the CLI that started it was gone before it started',
    async () => {
      const gone = spawnTracked(process.execPath, ['-e', ''], {
        cwd: tempDir(),
        env: baseEnv(),
      })
      await gone.exited
      const channel = (await startApi()).channel(workerId())
      const dir = write(tempDir(), {
        'handler.py': 'def handler(event, context):\n    return 1\n',
      })
      const child = spawnTracked(
        python,
        clientArgs({ dir, handler: 'handler.handler', parentPid: gone.pid }),
        { cwd: dir, env: lambdaEnv(channel) },
      )
      expect(await exitWithin(child, 10_000)).toEqual({
        code: 0,
        signal: null,
      })
    },
  )

  posixOnly(
    'started through a wrapper, serves while the CLI runs and exits once it is gone',
    async () => {
      // The CLI stand-in is not this client's parent, the way a launcher that does not exec sits
      // between the two.
      const cli = spawnTracked(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 60_000)'],
        { cwd: tempDir(), env: baseEnv() },
      )
      const channel = (await startApi()).channel(workerId())
      const dir = write(tempDir(), {
        'handler.py': 'def handler(event, context):\n    return 1\n',
      })
      const child = spawnTracked(
        python,
        clientArgs({ dir, handler: 'handler.handler', parentPid: cli.pid }),
        { cwd: dir, env: lambdaEnv(channel) },
      )
      expect((await collect(await channel.dispatch(invocation()))).text).toBe(
        '1',
      )
      // Parent checks keep passing while the CLI is alive.
      expect(await exitWithin(child, 2_500)).toBe('still running')
      cli.kill('SIGKILL')
      expect(await exitWithin(child, 10_000)).toEqual({
        code: 0,
        signal: null,
      })
    },
  )

  posixOnly(
    'a client whose CLI is gone kills the processes its handler started, and nothing outside its group',
    async () => {
      const cli = spawnTracked(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 60_000)'],
        { cwd: tempDir(), env: baseEnv() },
      )
      // In the test's own process group, the way the CLI and its terminal are.
      const bystander = spawnTracked(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 60_000)'],
        { cwd: tempDir(), env: baseEnv() },
      )
      const channel = (await startApi()).channel(workerId())
      const dir = write(tempDir(), {
        'handler.py': [
          'import subprocess',
          'import sys',
          '',
          'def handler(event, context):',
          "    sidecar = subprocess.Popen([sys.executable, '-c', 'import time\\nwhile True: time.sleep(1)'])",
          "    with open('sidecar.pid', 'w') as pid:",
          '        pid.write(str(sidecar.pid))',
          '    return 1',
          '',
        ].join('\n'),
      })
      const client = spawn(
        python,
        clientArgs({
          dir,
          handler: 'handler.handler',
          parentPid: cli.pid,
          ownGroup: true,
        }),
        { cwd: dir, env: lambdaEnv(channel), detached: true, stdio: 'ignore' },
      )
      try {
        expect((await collect(await channel.dispatch(invocation()))).text).toBe(
          '1',
        )
        const sidecar = Number(
          readFileSync(path.join(dir, 'sidecar.pid'), 'utf8'),
        )
        expect(alive(sidecar)).toBe(true)
        cli.kill('SIGKILL')
        expect(
          await waitFor(() => !alive(client.pid) && !alive(sidecar), 8_000),
        ).toBe(true)
        expect(alive(bystander.pid)).toBe(true)
      } finally {
        try {
          process.kill(-client.pid, 'SIGKILL')
        } catch {
          // Already gone.
        }
      }
    },
  )

  posixOnly(
    'a client that does not lead a process group of its own exits alone, leaving its group',
    async () => {
      const channel = (await startApi()).channel(workerId())
      const dir = write(tempDir(), {
        'handler.py': 'def handler(event, context):\n    return 1\n',
      })
      const args = clientArgs({
        dir,
        handler: 'handler.handler',
        ownGroup: true,
      })
      // The CLI stand-in leads a process group and starts the client inside it, not as a leader.
      const cli = spawn(
        process.execPath,
        [
          '-e',
          [
            "const { spawn } = require('child_process')",
            `const child = spawn(${JSON.stringify(python)}, ${JSON.stringify(args)}, { cwd: ${JSON.stringify(dir)}, env: ${JSON.stringify(lambdaEnv(channel))}, stdio: 'ignore' })`,
            'console.log(child.pid)',
            'setTimeout(() => {}, 60_000)',
          ].join('\n'),
        ],
        {
          cwd: dir,
          env: baseEnv(),
          detached: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      )
      let printed = ''
      cli.stdout.on('data', (chunk) => {
        printed += chunk
      })
      try {
        expect(await waitFor(() => /^\d+\r?\n/.test(printed), 10_000)).toBe(
          true,
        )
        const clientPid = Number(printed.trim())
        expect((await collect(await channel.dispatch(invocation()))).text).toBe(
          '1',
        )
        await api.close()
        api = null
        expect(await waitFor(() => !alive(clientPid), 10_000)).toBe(true)
        expect(alive(cli.pid)).toBe(true)
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
