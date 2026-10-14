import { jest } from '@jest/globals'

const runDevSession = jest.fn(async () => 3)
jest.unstable_mockModule(
  '../../../../../../lib/plugins/aws/dev/attach/session.js',
  () => ({ runDevSession }),
)
const runDevStatus = jest.fn(async () => ({
  result: { status: 'ok', state: 'off', message: 'Dev Mode is off here.' },
  human: ['Dev Mode is off here.'],
}))
jest.unstable_mockModule(
  '../../../../../../lib/plugins/aws/dev/commands/status.js',
  () => ({
    runDevStatus,
    // What `--detach` reuses from it.
    statusModeTable: jest.fn(),
    statusTableWorthShowing: jest.fn(),
  }),
)
const runDevStop = jest.fn(async () => ({
  result: {
    status: 'error',
    reason: 'restore_incomplete',
    message: 'Dev Mode stopped, but 1 function could not be restored.',
  },
  human: [
    ['warning', 'Dev Mode stopped, but 1 function could not be restored.'],
  ],
}))
jest.unstable_mockModule(
  '../../../../../../lib/plugins/aws/dev/commands/stop.js',
  () => ({ runDevStop }),
)
const runDevWait = jest.fn(async () => ({
  result: {
    status: 'timeout',
    reason: 'timeout',
    message: 'Nothing matched within 5s; the session is still running.',
  },
  human: 'Nothing matched within 5s; the session is still running.',
}))
jest.unstable_mockModule(
  '../../../../../../lib/plugins/aws/dev/commands/wait.js',
  () => ({
    runDevWait,
    // What `--detach` reuses from it.
    PRESENCE_POLL_MS: 1_000,
    TOUCH_INTERVAL_MS: 30_000,
    terminalOf: jest.fn(),
    waitForRecord: jest.fn(),
  }),
)
const { default: AwsDev } =
  await import('../../../../../../lib/plugins/aws/dev/index.js')

const fakeServerless = () => ({
  serviceDir: '/svc',
  getProvider: () => ({ name: 'provider' }),
  processedInput: { commands: ['dev'], options: {} },
  configSchemaHandler: {
    defineFunctionProperties: jest.fn(),
    defineTopLevelProperty: jest.fn(),
  },
  service: { functions: { api: {} }, initialServerlessConfig: {} },
  configurationInput: {},
})

afterEach(() => {
  process.exitCode = undefined
  runDevSession.mockClear()
})

test('functions mode runs the attach session and passes its exit code on', async () => {
  const serverless = fakeServerless()
  const dev = new AwsDev(serverless, { 'on-exit': 'keep' })
  await dev.dev()
  expect(runDevSession).toHaveBeenCalledWith({
    serverless,
    provider: { name: 'provider' },
    options: { 'on-exit': 'keep' },
  })
  expect(process.exitCode).toBe(3)
  // The CLI reads it to report the command as not succeeded.
  expect(serverless.exitCode).toBe(3)
})

test('a clean session leaves the exit code alone', async () => {
  runDevSession.mockResolvedValueOnce(0)
  const serverless = fakeServerless()
  await new AwsDev(serverless, {}).dev()
  expect(process.exitCode).toBeUndefined()
  expect(serverless.exitCode).toBeUndefined()
})

test('functions mode installs no signal handlers of its own', async () => {
  const counts = () =>
    ['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => process.listenerCount(s))
  const before = counts()
  await new AwsDev(fakeServerless(), {}).dev()
  expect(counts()).toEqual(before)
})

test('--on-exit accepts keep and remove only', async () => {
  await expect(
    new AwsDev(fakeServerless(), { 'on-exit': 'bogus' }).dev(),
  ).rejects.toMatchObject({
    code: 'INVALID_DEV_ON_EXIT_OPTION',
    message: 'Option "--on-exit" must be "keep" or "remove".',
  })
  for (const value of ['keep', 'remove']) {
    expect(() =>
      new AwsDev(fakeServerless(), {
        'on-exit': value,
      }).validateOnExitOption(),
    ).not.toThrow()
  }
  expect(runDevSession).not.toHaveBeenCalled()
})

test('dev no longer hooks packaging and adds nothing to the serverless.yml schema', () => {
  const serverless = fakeServerless()
  const dev = new AwsDev(serverless, {})
  expect(dev.hooks['before:package:createDeploymentArtifacts']).toBeUndefined()
  expect(
    serverless.configSchemaHandler.defineFunctionProperties,
  ).not.toHaveBeenCalled()
  expect(
    serverless.configSchemaHandler.defineTopLevelProperty,
  ).not.toHaveBeenCalled()
})

/** process.stdout writes during `fn`, kept instead of printed. */
const stdoutOf = async (fn) => {
  const written = []
  const write = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((text) => written.push(String(text)))
  try {
    await fn()
  } finally {
    write.mockRestore()
  }
  return written.join('')
}

test('dev status runs through the finite-command helper: one JSON result, exit 0 left alone', async () => {
  const serverless = fakeServerless()
  serverless.processedInput = { commands: ['dev', 'status'], options: {} }
  const dev = new AwsDev(serverless, { json: true })
  const out = await stdoutOf(() => dev.hooks['dev:status:status']())
  expect(runDevStatus).toHaveBeenCalledWith(
    expect.objectContaining({ serviceDir: '/svc', options: { json: true } }),
  )
  expect(JSON.parse(out)).toEqual({
    v: 1,
    status: 'ok',
    message: 'Dev Mode is off here.',
    state: 'off',
  })
  expect(process.exitCode).toBeUndefined()
  expect(serverless.exitCode).toBeUndefined()
})

test('a finite command that ends in an error sets the exit code for the shell and the CLI', async () => {
  runDevStatus.mockResolvedValueOnce({
    result: { status: 'error', reason: 'error', message: 'boom' },
    human: [['error', 'boom']],
  })
  const serverless = fakeServerless()
  serverless.processedInput = { commands: ['dev', 'status'], options: {} }
  await new AwsDev(serverless, {}).hooks['dev:status:status']()
  expect(process.exitCode).toBe(1)
  // The CLI reads it to report the command as not succeeded.
  expect(serverless.exitCode).toBe(1)
})

test('dev stop runs through the finite-command helper and sets exit 3 for the shell and the CLI', async () => {
  const serverless = fakeServerless()
  const dev = new AwsDev(serverless, { keep: true })
  await dev.hooks['dev:stop:stop']()
  expect(runDevStop).toHaveBeenCalledWith(
    expect.objectContaining({ serviceDir: '/svc', options: { keep: true } }),
  )
  expect(process.exitCode).toBe(3)
  expect(serverless.exitCode).toBe(3)
})

test('dev wait runs through the finite-command helper and a timeout exits 124', async () => {
  const serverless = fakeServerless()
  const dev = new AwsDev(serverless, { for: 'invocation', json: true })
  const out = await stdoutOf(() => dev.hooks['dev:wait:wait']())
  expect(runDevWait).toHaveBeenCalledWith(
    expect.objectContaining({
      serviceDir: '/svc',
      options: { for: 'invocation', json: true },
    }),
  )
  expect(JSON.parse(out)).toMatchObject({ v: 1, status: 'timeout' })
  expect(process.exitCode).toBe(124)
  expect(serverless.exitCode).toBe(124)
})

test('a foreground dev --json is refused, with one JSON result on stdout', async () => {
  let refused
  const out = await stdoutOf(async () => {
    // A service run in its own directory: its paths read as they always have.
    refused = await new AwsDev(
      { ...fakeServerless(), serviceDir: process.cwd() },
      { json: true },
    )
      .dev()
      .catch((error) => error)
  })
  expect(refused).toMatchObject({
    code: 'DEV_MODE_INVALID_OPTION_COMBINATION',
    message:
      '--json works with --detach or --dry-run; a running session writes its events to .serverless/dev/session.ndjson.',
  })
  expect(JSON.parse(out)).toEqual({
    v: 1,
    status: 'error',
    reason: 'invalid_option_combination',
    message:
      '--json works with --detach or --dry-run; a running session writes its events to .serverless/dev/session.ndjson.',
  })
  expect(runDevSession).not.toHaveBeenCalled()
})

test('--detach in agents mode is refused', async () => {
  const serverless = fakeServerless()
  serverless.service.initialServerlessConfig = { ai: { agents: { a: {} } } }
  const dev = new AwsDev(serverless, { mode: 'agents', detach: true })
  dev.startAgentsDevMode = jest.fn(async () => {})
  await expect(dev.dev()).rejects.toMatchObject({
    code: 'DEV_MODE_INVALID_OPTION_COMBINATION',
    message: '--detach works only in functions mode.',
  })
  expect(dev.startAgentsDevMode).not.toHaveBeenCalled()
  expect(runDevSession).not.toHaveBeenCalled()
})

test('--dry-run, --idle-timeout and --session-process in sandboxes mode are refused together', async () => {
  const serverless = fakeServerless()
  serverless.service.sandboxes = { box: {} }
  const dev = new AwsDev(serverless, {
    mode: 'sandboxes',
    'dry-run': true,
    'idle-timeout': '5m',
    'session-process': true,
  })
  dev.startSandboxesDevMode = jest.fn(async () => {})
  await expect(dev.dev()).rejects.toMatchObject({
    code: 'DEV_MODE_INVALID_OPTION_COMBINATION',
    message:
      '--dry-run, --idle-timeout, --session-process work only in functions mode.',
  })
  expect(dev.startSandboxesDevMode).not.toHaveBeenCalled()
})

test('--no-detach in agents mode is accepted: only a set option is refused', async () => {
  const serverless = fakeServerless()
  serverless.service.initialServerlessConfig = { ai: { agents: { a: {} } } }
  const dev = new AwsDev(serverless, {
    mode: 'agents',
    detach: false,
    'dry-run': false,
  })
  dev.startAgentsDevMode = jest.fn(async () => {})
  await dev.dev()
  expect(dev.startAgentsDevMode).toHaveBeenCalled()
  expect(runDevSession).not.toHaveBeenCalled()
})

test('a Dev Mode command started through Compose names the service in what it suggests', async () => {
  const { cliCommand, resetCliNames } =
    await import('../../../../../../lib/plugins/aws/dev/commands/cli-names.js')
  const throughCompose = (commands) => ({
    ...fakeServerless(),
    processedInput: { commands, options: {} },
    compose: { isWithinCompose: true, serviceName: 'consumer' },
  })
  try {
    for (const commands of [['dev'], ['dev', 'wait']]) {
      resetCliNames()
      new AwsDev(throughCompose(commands), {})
      expect(cliCommand('dev stop')).toBe('serverless consumer dev stop')
    }
    // Another command of a Compose run (a deploy of several services) leaves the names alone.
    resetCliNames()
    new AwsDev(throughCompose(['deploy']), {})
    expect(cliCommand('dev stop')).toBe('serverless dev stop')
  } finally {
    resetCliNames()
  }
})

test('--json in agents mode is left to that mode', async () => {
  const serverless = fakeServerless()
  serverless.service.initialServerlessConfig = { ai: { agents: { a: {} } } }
  const dev = new AwsDev(serverless, { json: true, mode: 'agents' })
  dev.startAgentsDevMode = jest.fn(async () => {})
  await dev.dev()
  expect(dev.startAgentsDevMode).toHaveBeenCalled()
  expect(runDevSession).not.toHaveBeenCalled()
})
