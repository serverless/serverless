import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals'
import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import {
  IOT_CONNECT_TIMEOUT_MS,
  checkIotConnect,
  findRunningSession,
  renderDryRun,
  planSession,
  runDevDryRun,
} from '../../../../../../../lib/plugins/aws/dev/commands/dry-run.js'
import { exitCodeOf } from '../../../../../../../lib/plugins/aws/dev/commands/envelope.js'
import {
  buildPermissionPolicy,
  createBroker,
} from '../../../../../../../lib/plugins/aws/dev/attach/broker.js'
import { layerDescription } from '../../../../../../../lib/plugins/aws/dev/attach/layer.js'
import {
  ACCOUNT,
  IOT_ENDPOINT,
  artifact,
  countingTimers,
  fakeIam,
  fakeIot,
  fakeLambda,
  fakeProvider,
  fakeServerless,
} from '../attach/fakes.js'
import { runWithoutColor } from '../without-color.js'

// Its tests read the plain text of styled lines.
runWithoutColor()

const LOCAL = {
  node: { available: true, command: 'node', version: '24.21.0' },
  python: { available: true, command: 'python3', version: '3.13.8' },
}
const READS = {
  lambda: [
    'getFunction',
    'getFunctionOnce',
    'listLayerVersions',
    'getLayerVersion',
  ],
  iam: ['getRole', 'getRolePolicy'],
  iot: ['describeEndpoint'],
}
/** The client, with every method but its reads throwing. */
const readOnly = (client, reads) =>
  new Proxy(client, {
    get(target, name) {
      const value = target[name]
      if (typeof value === 'function' && !reads.includes(name)) {
        return () => {
          throw new Error(`the dry run called ${String(name)}`)
        }
      }
      return value
    },
  })

let savedSuffix
beforeAll(() => {
  savedSuffix = process.env.SLS_DEV_TEST_SUFFIX
  delete process.env.SLS_DEV_TEST_SUFFIX
})
afterAll(() => {
  if (savedSuffix === undefined) delete process.env.SLS_DEV_TEST_SUFFIX
  else process.env.SLS_DEV_TEST_SUFFIX = savedSuffix
})
const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

// `report` really cannot run on this machine (Java), with or without a deployed stage.
const FUNCTIONS = { api: {}, worker: {}, report: { runtime: 'java21' } }
const LIVE = {
  'svc-dev-api': {},
  'svc-dev-worker': { Runtime: 'python3.13', Architectures: ['x86_64'] },
  'svc-dev-report': { Runtime: 'java21' },
}

const setup = ({
  stage = 'dev',
  live = LIVE,
  functions = FUNCTIONS,
  iot = fakeIot(),
  stackExists = true,
  connectIot = async () => ({ ok: true, status: 403 }),
  connect = async () => null,
  provider = fakeProvider({ stage }),
  options = {},
} = {}) => {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(serviceDir)
  const lambda = fakeLambda(live)
  const iam = fakeIam()
  const serverless = { ...fakeServerless({ stage, functions }), serviceDir }
  const deps = {
    clients: {
      lambda: readOnly(lambda, READS.lambda),
      iam: readOnly(iam, READS.iam),
      iot: readOnly(iot, READS.iot),
    },
    stackExists: async () => stackExists,
    readArtifact: async (arch) => artifact(arch),
    detectLocal: async () => LOCAL,
    lookup: async () => ({ address: '127.0.0.1' }),
    connectIot,
    connect,
    owner: 'alice@mbp',
    now: () => Date.parse('2026-10-05T10:40:00.000Z'),
    fs,
  }
  return { serverless, provider, options, deps, lambda, iam, serviceDir }
}
const writes = ({ lambda, iam }) => [
  ...lambda.calls.filter(([op]) => !READS.lambda.includes(op)),
  ...iam.calls.filter(([op]) => !READS.iam.includes(op)),
]
const checks = (preflight) =>
  preflight.map(({ check, ok, reason }) => [check, ok, reason])

describe('serverless dev --dry-run', () => {
  test('changes nothing and reports the plan, the functions and every check', async () => {
    const run = setup()
    const { result, human } = await runDevDryRun(run)
    expect(exitCodeOf(result)).toBe(0)
    expect(result).toMatchObject({
      v: 1,
      status: 'ok',
      plan: {
        first_deploy: false,
        account_setup: [
          {
            action: 'create_broker_role',
            name: 'serverless-dev-broker-us-east-1',
          },
          {
            action: 'publish_layer',
            name: expect.stringMatching(/^serverless-dev-/),
          },
          {
            action: 'publish_layer',
            name: expect.stringMatching(/^serverless-dev-/),
          },
        ],
        changes: [
          {
            function: 'api',
            action: 'attach',
            fields: ['layers', 'environment', 'exec_wrapper'],
          },
          {
            function: 'worker',
            action: 'attach',
            fields: ['layers', 'environment', 'exec_wrapper'],
          },
        ],
      },
      functions: [
        { name: 'api', mode: 'dev' },
        { name: 'worker', mode: 'dev' },
        expect.objectContaining({
          name: 'report',
          mode: 'deployed',
          reason: 'runtime_not_supported',
        }),
      ],
    })
    // One layer per architecture: arm64 for api, x86_64 for worker.
    expect(result.plan.account_setup.slice(1).map((step) => step.name)).toEqual(
      ['serverless-dev-arm64', 'serverless-dev-x86_64'],
    )
    expect(checks(result.preflight)).toEqual([
      ['stage', true, undefined],
      ['signin', true, undefined],
      ['session', true, undefined],
      ['aws_identity', true, undefined],
      ['iot_endpoint', true, undefined],
      ['iot_connect', true, undefined],
      ['broker_role', true, 'broker_missing'],
      ['stack', true, undefined],
      ['functions', true, undefined],
      ['layers', true, 'layers_missing'],
    ])
    expect(
      result.preflight.find((c) => c.check === 'aws_identity').message,
    ).toBe('assumed-role/Developer/alice')
    expect(result.preflight.find((c) => c.check === 'iot_connect').host).toBe(
      IOT_ENDPOINT,
    )
    // A passing check is never marked for a person to act on.
    expect(result.preflight.filter((c) => 'user_action_required' in c)).toEqual(
      [],
    )
    expect(JSON.stringify(result)).not.toContain(ACCOUNT)
    expect(writes(run)).toEqual([])
    expect(fs.existsSync(path.join(run.serviceDir, '.serverless', 'dev'))).toBe(
      false,
    )
    expect(human[0]).toEqual([
      'notice',
      'Dev Mode dry run for "svc" on stage "dev" (us-east-1)',
    ])
    // The outcome is the last line, at success level: the logger gives it its mark.
    expect(human.at(-1)).toEqual([
      'success',
      'Dry run: nothing was changed. Run "serverless dev" to start.',
    ])
  })

  test('a protected stage is refused before any AWS call', async () => {
    const provider = {
      ...fakeProvider({ stage: 'prod' }),
      getAccountInfo: jest.fn(),
    }
    const run = setup({ stage: 'prod', provider })
    const { result } = await runDevDryRun(run)
    expect(result).toMatchObject({
      status: 'error',
      reason: 'stage_protected',
      plan: null,
      functions: [],
    })
    expect(result).not.toHaveProperty('user_action_required')
    expect(checks(result.preflight)).toEqual([
      ['stage', false, 'stage_protected'],
    ])
    expect(result.preflight[0]).not.toHaveProperty('user_action_required')
    expect(exitCodeOf(result)).toBe(1)
    expect(provider.getAccountInfo).not.toHaveBeenCalled()
    expect(run.lambda.calls).toEqual([])
  })

  test('an AWS IoT Core endpoint that cannot be reached is network_blocked, with its host', async () => {
    const run = setup({
      connectIot: async () => ({ ok: false, message: 'no answer within 5s' }),
    })
    const { result } = await runDevDryRun(run)
    expect(result).toMatchObject({
      status: 'action_required',
      reason: 'network_blocked',
      user_action_required: true,
    })
    expect(result.preflight.find((c) => c.check === 'iot_connect')).toEqual({
      check: 'iot_connect',
      ok: false,
      reason: 'network_blocked',
      host: IOT_ENDPOINT,
      user_action_required: true,
      message: `Dev Mode could not connect to AWS IoT Core at ${IOT_ENDPOINT}:443 (no answer within 5s). Allow outbound HTTPS to that host, or set HTTPS_PROXY, then run the command again.`,
    })
    // The other checks still ran, and the plan is still built: only the connection failed.
    expect(result.functions).toHaveLength(3)
    expect(result.plan).not.toBeNull()
    expect(result.plan.changes.map((change) => change.function)).toEqual([
      'api',
      'worker',
    ])
    expect(result.preflight.map((c) => c.check)).toContain('layers')
    expect(exitCodeOf(result)).toBe(1)
  })

  test("an endpoint whose name does not resolve yet gets the advice for a region's first use", async () => {
    const detail = `getaddrinfo ENOTFOUND ${IOT_ENDPOINT}`
    const run = setup({
      connectIot: async () => ({
        ok: false,
        unresolved: true,
        message: detail,
      }),
    })
    const { result } = await runDevDryRun(run)
    expect(result).toMatchObject({
      status: 'action_required',
      reason: 'network_blocked',
    })
    expect(result.preflight.find((c) => c.check === 'iot_connect')).toEqual({
      check: 'iot_connect',
      ok: false,
      reason: 'network_blocked',
      host: IOT_ENDPOINT,
      user_action_required: true,
      message: `The AWS IoT Core endpoint for this account in us-east-1 cannot be resolved yet (${detail}). AWS creates an account's endpoint in a region the first time it is used there, and it can take a few minutes before it resolves. Run the command again in a few minutes. If it still cannot be resolved then, check your network connection and proxy settings (HTTPS_PROXY).`,
    })
  })

  test('a region without AWS IoT Core is region_no_broker', async () => {
    const notFound = Object.assign(
      new Error('getaddrinfo ENOTFOUND iot.ap-east-2.amazonaws.com'),
      { code: 'ENOTFOUND' },
    )
    const { result } = await runDevDryRun(setup({ iot: fakeIot(notFound) }))
    expect(result).toMatchObject({
      status: 'error',
      reason: 'region_no_broker',
    })
    expect(result.preflight.map((c) => c.check)).not.toContain('iot_connect')
  })

  test('credentials AWS rejects end the dry run at the identity check', async () => {
    const expired = Object.assign(
      new Error('The security token included in the request is expired'),
      { name: 'ExpiredTokenException' },
    )
    const provider = {
      ...fakeProvider(),
      getProfile: () => 'dev-sso',
      getAccountInfo: async () => {
        throw expired
      },
    }
    const run = setup({ provider })
    const { result } = await runDevDryRun(run)
    expect(result).toMatchObject({
      status: 'action_required',
      reason: 'credentials_expired',
      user_action_required: true,
      plan: null,
    })
    // The advice names the service's profile and the CLI's own sign-in.
    expect(
      result.preflight.find((c) => c.check === 'aws_identity').message,
    ).toContain(
      'The credentials come from AWS profile "dev-sso": sign in again with "serverless login aws --aws-profile dev-sso"',
    )
    expect(result.preflight.map((c) => c.check)).toEqual([
      'stage',
      'signin',
      'session',
      'aws_identity',
    ])
    expect(run.lambda.calls).toEqual([])
  })

  test('a denied read names its permission and asks a person to act', async () => {
    const run = setup()
    run.iam.getRoleError = Object.assign(new Error('not authorized'), {
      name: 'AccessDenied',
    })
    const { result } = await runDevDryRun(run)
    expect(result).toMatchObject({
      status: 'action_required',
      reason: 'permission_denied',
    })
    expect(result.preflight.find((c) => c.check === 'broker_role')).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'permission_denied',
        user_action_required: true,
        message: expect.stringContaining('iam:GetRole'),
      }),
    )
    // The plan does not claim the role it could not read will be created.
    expect(result.plan.account_setup.map((step) => step.action)).not.toContain(
      'create_broker_role',
    )
  })

  test('a broker with an older version of the permission policy is reported and planned for update', async () => {
    const run = setup()
    const name = 'serverless-dev-broker-us-east-1'
    const at = {
      identity: { accountId: ACCOUNT, partition: 'aws' },
      region: 'us-east-1',
    }
    await createBroker({ iam: run.iam, name, ...at })
    run.iam.policies.set(
      `${name}/serverless-dev-broker`,
      buildPermissionPolicy({ ...at, version: 0 }),
    )
    run.iam.calls.length = 0
    const { result, human } = await runDevDryRun(run)
    expect(result.preflight.find((c) => c.check === 'broker_role')).toEqual(
      expect.objectContaining({
        ok: true,
        message: `IAM role ${name} exists; its permission policy differs from the one this version of Dev Mode writes and is updated when a session starts`,
      }),
    )
    expect(result.plan.account_setup[0]).toEqual({
      action: 'update_broker_policy',
      name,
    })
    expect(human.map(([, text]) => text).join('\n')).toContain(
      `  • update the permission policy serverless-dev-broker of IAM role ${name} (it differs from the one this version of Dev Mode writes)`,
    )
    expect(writes(run)).toEqual([])
  })

  test('a function in Dev Mode for someone else is skipped by the earlier rule, with no liveness ping', async () => {
    const live = {
      ...LIVE,
      'svc-dev-api': {
        Environment: {
          Variables: {
            AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
            SLS_DEV_SESSION: 's_0123456789ab',
            SLS_DEV_OWNER: 'bob@desk',
          },
        },
      },
    }
    const { result } = await runDevDryRun(setup({ live }))
    expect(result.functions[0]).toMatchObject({
      name: 'api',
      mode: 'skipped',
      reason: 'owned_by_other_session',
    })
  })

  test('a stage that is not deployed: the plan deploys it first, and no function is read', async () => {
    const run = setup({ stackExists: false })
    const { result } = await runDevDryRun(run)
    expect(result).toMatchObject({
      status: 'ok',
      plan: { first_deploy: true, changes: [] },
    })
    expect(result.functions.map((f) => f.mode)).toEqual([
      'dev',
      'dev',
      'deployed',
    ])
    expect(run.lambda.calls.filter(([op]) => op === 'getFunction')).toEqual([])
  })

  test('on a stage that is not deployed, a 2 s timeout is timeout_too_short, as in the session', async () => {
    const { result } = await runDevDryRun(
      setup({
        stackExists: false,
        functions: { api: {}, quick: { timeout: 2 } },
      }),
    )
    expect(result.functions[1]).toMatchObject({
      name: 'quick',
      mode: 'deployed',
      reason: 'timeout_too_short',
    })
  })

  test('on Node.js 18.19 an MCP server function runs the deployed code, on either kind of stage', async () => {
    for (const stackExists of [true, false]) {
      const run = setup({
        stackExists,
        functions: { api: {}, crm: {} },
        live: { 'svc-dev-api': {}, 'svc-dev-crm': {} },
      })
      run.serverless.pluginManager.plugins = [
        { validated: { servers: [{ name: 'crm' }] } },
      ]
      run.deps.detectLocal = async () => ({
        node: { available: true, command: 'node', version: '18.19.0' },
      })
      const { result } = await runDevDryRun(run)
      expect(result.functions).toMatchObject([
        { name: 'api', mode: 'dev' },
        {
          name: 'crm',
          mode: 'deployed',
          reason: 'local_runtime_missing',
          why: 'Node.js 18.19.0 on this machine (MCP servers need Node.js 20.6 or later)',
        },
      ])
    }
  })

  test('on a deployed stage, the live timeout decides timeout_too_short', async () => {
    const { result } = await runDevDryRun(
      setup({
        functions: { api: {}, quick: {} },
        live: { 'svc-dev-api': {}, 'svc-dev-quick': { Timeout: 2 } },
      }),
    )
    expect(result.functions[1]).toMatchObject({
      name: 'quick',
      mode: 'deployed',
      reason: 'timeout_too_short',
    })
  })

  test('on a deployed stage, a function with custom AWS endpoints runs the deployed code', async () => {
    const { result } = await runDevDryRun(
      setup({
        functions: { api: {}, fips: {} },
        live: {
          'svc-dev-api': {},
          'svc-dev-fips': {
            Environment: { Variables: { AWS_USE_FIPS_ENDPOINT: 'true' } },
          },
        },
      }),
    )
    expect(result.functions[1]).toMatchObject({
      name: 'fips',
      mode: 'deployed',
      reason: 'custom_aws_endpoints',
      why: 'uses custom AWS endpoints (AWS_USE_FIPS_ENDPOINT)',
    })
  })

  describe('a layer named serverless-dev-<arch> left on a function without the wrapper or undo record', () => {
    const leftover = `arn:aws:lambda:us-east-1:${ACCOUNT}:layer:serverless-dev-arm64:1`
    const leftWith = (description) => {
      const run = setup({
        live: { ...LIVE, 'svc-dev-api': { Layers: [{ Arn: leftover }] } },
      })
      run.lambda.layers.set('serverless-dev-arm64', [
        {
          Version: 1,
          LayerVersionArn: leftover,
          Description: description,
          CodeSha256: 'old',
        },
      ])
      return run
    }

    test('with the description Dev Mode publishes, the function would run here', async () => {
      const run = leftWith(layerDescription('0'.repeat(64)))
      const { result } = await runDevDryRun(run)
      expect(result.functions[0]).toMatchObject({ name: 'api', mode: 'dev' })
      expect(result.functions[0].reason).not.toBe('layer_name_taken')
      expect(writes(run)).toEqual([])
    })

    test('with any other description, the function keeps its deployed code', async () => {
      const run = leftWith(`${layerDescription('0'.repeat(64))} (patched)`)
      const { result } = await runDevDryRun(run)
      expect(result.functions[0]).toMatchObject({
        name: 'api',
        mode: 'deployed',
        reason: 'layer_name_taken',
      })
    })
  })

  test('nothing that can attach is nothing_to_attach', async () => {
    const run = setup({
      functions: { report: { runtime: 'java21' } },
      live: { 'svc-dev-report': { Runtime: 'java21' } },
    })
    const { result } = await runDevDryRun(run)
    expect(result).toMatchObject({
      status: 'error',
      reason: 'nothing_to_attach',
    })
    expect(result).not.toHaveProperty('user_action_required')
    expect(exitCodeOf(result)).toBe(1)
  })

  test('a session running here is reported; one of another stage must be stopped first', async () => {
    const record = {
      session_id: 's_3f2a9c1e0b4d',
      pid: 41234,
      state: 'on',
      stage: 'dev',
      region: 'us-east-1',
      selection: { only: [], skip: [] },
    }
    const same = await runDevDryRun(
      setup({ connect: async () => ({ record }) }),
    )
    expect(
      same.result.preflight.find((c) => c.check === 'session'),
    ).toMatchObject({
      ok: true,
      reason: 'already_running',
      message:
        'Dev Mode is already on here (session s_3f2a9c1e0b4d, pid 41234, stage dev).',
    })
    const other = await runDevDryRun(
      setup({ connect: async () => ({ record: { ...record, stage: 'qa' } }) }),
    )
    expect(other.result).toMatchObject({
      status: 'error',
      reason: 'session_running',
    })
    expect(
      other.result.preflight.find((c) => c.check === 'session').message,
    ).toBe(
      'Another Dev Mode session is running here (stage qa, pid 41234). Stop it first with "serverless dev stop".',
    )
  })

  test('a session of the same scope that is still starting is described as starting, not on', async () => {
    const record = {
      session_id: 's_3f2a9c1e0b4d',
      pid: 41234,
      state: 'starting',
      stage: 'dev',
      region: 'us-east-1',
      selection: { only: [], skip: [] },
      control: null,
    }
    const { result } = await runDevDryRun(
      setup({ connect: async () => ({ record }) }),
    )
    expect(result.status).toBe('ok')
    expect(result.preflight.find((c) => c.check === 'session')).toMatchObject({
      ok: true,
      reason: 'already_running',
      message:
        'Dev Mode is starting here (session s_3f2a9c1e0b4d, pid 41234, stage dev).',
    })
  })

  test('without an injected stack check, it asks CloudFormation whether the stage is deployed', async () => {
    const run = setup()
    delete run.deps.stackExists
    const request = jest.fn(async () => ({ Stacks: [{ Outputs: [] }] }))
    run.provider = { ...run.provider, request }
    const { result } = await runDevDryRun(run)
    expect(result).toMatchObject({
      status: 'ok',
      plan: { first_deploy: false },
    })
    expect(request).toHaveBeenCalledWith('CloudFormation', 'describeStacks', {
      StackName: 'svc-dev',
    })
  })

  test('an unexpected error is an error result with exit 1, never ok', async () => {
    const run = setup()
    run.serverless.service.getAllFunctions = () => {
      throw new Error('the configuration is gone')
    }
    const { result } = await runDevDryRun(run)
    expect(result).toMatchObject({
      status: 'error',
      reason: 'error',
      message: 'the configuration is gone',
    })
    expect(exitCodeOf(result)).toBe(1)
  })

  test('the human text has the plan, the table and the checks', async () => {
    const planned = await planSession(
      setup({ connectIot: async () => ({ ok: false, message: 'refused' }) }),
    )
    const lines = renderDryRun(planned)
    const text = lines.map(([, line = '']) => line).join('\n')
    expect(text).toContain('These changes will be made to 2 functions')
    expect(text).toMatch(/report\s+deployed/)
    expect(text).toContain('Checks:\n')
    expect(text).toContain('  ✔ AWS identity')
    expect(text).toContain('  ✖ Connection to AWS IoT Core')
    // Sections are apart: a blank line before the plan, the table, the checks and the outcome.
    expect(lines.filter(([level]) => level === 'blankLine')).toHaveLength(4)
    expect(lines.at(-1)).toEqual([
      'error',
      'Dry run: nothing was changed. Fix what is marked ✖, then run "serverless dev".',
    ])
  })
})

describe('the running session a dry run reports', () => {
  const sessionDir = () => {
    const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    dirs.push(serviceDir)
    const dir = path.join(serviceDir, '.serverless', 'dev')
    fs.mkdirSync(dir, { recursive: true })
    return { serviceDir, dir }
  }
  const starting = {
    v: 1,
    session_id: 's_3f2a9c1e0b4d',
    pid: 41234,
    state: 'starting',
    stage: 'dev',
    region: 'us-east-1',
    selection: { only: [], skip: [] },
    started_at: new Date().toISOString(),
    control: null,
  }
  const on = {
    ...starting,
    state: 'on',
    control: { url: 'http://127.0.0.1:1', token_file: 'control.token' },
  }
  const write = (dir, record) =>
    fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(record))
  /** The real filesystem, counting the reads of session.json. */
  const countingFs = () => {
    const counted = Object.create(fs)
    counted.reads = 0
    counted.readFileSync = (file, ...rest) => {
      if (String(file).endsWith('session.json')) counted.reads += 1
      return fs.readFileSync(file, ...rest)
    }
    return counted
  }

  test('a session still starting (no control endpoint yet, process alive) is running, read once', async () => {
    const { serviceDir, dir } = sessionDir()
    write(dir, starting)
    const counted = countingFs()
    const health = jest.fn()
    const found = await findRunningSession({
      serviceDir,
      fs: counted,
      isAlive: (pid) => pid === 41234,
      health,
    })
    expect(found).toEqual({ record: starting })
    expect(counted.reads).toBe(1)
    // A session that names no endpoint yet is not asked.
    expect(health).not.toHaveBeenCalled()
    expect(fs.readdirSync(dir)).toEqual(['session.json'])
  })

  test('a starting record whose process is gone, or none at all, is no session', async () => {
    const { serviceDir, dir } = sessionDir()
    const find = () =>
      findRunningSession({ serviceDir, fs, isAlive: () => false })
    expect(await find()).toBeNull()
    write(dir, starting)
    expect(await find()).toBeNull()
  })

  test('a record naming this process is never a running session', async () => {
    const { serviceDir, dir } = sessionDir()
    write(dir, { ...starting, pid: process.pid })
    expect(
      await findRunningSession({ serviceDir, fs, isAlive: () => true }),
    ).toBeNull()
  })

  test('a record with an endpoint that does not answer is not running', async () => {
    const { serviceDir, dir } = sessionDir()
    write(dir, on)
    expect(
      await findRunningSession({
        serviceDir,
        fs,
        isAlive: () => true,
        health: async () => null,
      }),
    ).toBeNull()
  })

  test('a session that answers on its endpoint with its id is running, read once', async () => {
    const { serviceDir, dir } = sessionDir()
    write(dir, on)
    const counted = countingFs()
    const health = jest.fn(async () => ({
      session_id: on.session_id,
      state: 'on',
    }))
    expect(
      await findRunningSession({
        serviceDir,
        fs: counted,
        isAlive: () => true,
        health,
      }),
    ).toEqual({ record: on })
    expect(health).toHaveBeenCalledWith({ record: on })
    expect(counted.reads).toBe(1)
  })

  test('an endpoint answering with another session id is not this record’s session', async () => {
    const { serviceDir, dir } = sessionDir()
    write(dir, on)
    expect(
      await findRunningSession({
        serviceDir,
        fs,
        isAlive: () => true,
        health: async () => ({ session_id: 's_ffffffffffff', state: 'on' }),
      }),
    ).toBeNull()
  })

  test('no service directory is no session', async () => {
    expect(await findRunningSession({ serviceDir: undefined, fs })).toBeNull()
  })
})

describe('the connection check to AWS IoT Core', () => {
  /** An https.request stand-in: answers, fails or stays silent. */
  const request = (behaviour) => (options, onResponse) => {
    const req = new EventEmitter()
    req.options = options
    req.destroy = (error) => req.emit('error', error)
    req.end = () =>
      setImmediate(() => {
        if (behaviour === 'answer') {
          onResponse(
            Object.assign(new EventEmitter(), { statusCode: 403, resume() {} }),
          )
        } else if (behaviour === 'refuse') {
          req.emit(
            'error',
            Object.assign(new Error('connect ECONNREFUSED'), {
              code: 'ECONNREFUSED',
            }),
          )
        } else {
          req.emit('timeout')
        }
      })
    return req
  }

  test('any answer means it can be reached', async () => {
    expect(
      await checkIotConnect({
        host: IOT_ENDPOINT,
        request: request('answer'),
        agentFor: () => undefined,
      }),
    ).toEqual({ ok: true, status: 403 })
  })

  test('a refusal or silence is a failure with the reason', async () => {
    expect(
      await checkIotConnect({
        host: IOT_ENDPOINT,
        request: request('refuse'),
        agentFor: () => undefined,
      }),
    ).toEqual({ ok: false, message: 'connect ECONNREFUSED' })
    expect(
      await checkIotConnect({
        host: IOT_ENDPOINT,
        request: request('silent'),
        agentFor: () => undefined,
      }),
    ).toEqual({
      ok: false,
      message: `no answer within ${IOT_CONNECT_TIMEOUT_MS / 1000}s`,
    })
  })

  test("a DNS failure of the endpoint's own name says so; one of another name (a proxy) does not", async () => {
    const failing = (hostname) => () => {
      const req = new EventEmitter()
      req.destroy = () => {}
      req.end = () =>
        setImmediate(() =>
          req.emit(
            'error',
            Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
              code: 'ENOTFOUND',
              hostname,
            }),
          ),
        )
      return req
    }
    expect(
      await checkIotConnect({
        host: IOT_ENDPOINT,
        request: failing(IOT_ENDPOINT),
        agentFor: () => undefined,
      }),
    ).toEqual({
      ok: false,
      unresolved: true,
      message: `getaddrinfo ENOTFOUND ${IOT_ENDPOINT}`,
    })
    expect(
      await checkIotConnect({
        host: IOT_ENDPOINT,
        request: failing('proxy.corp.example'),
        agentFor: () => undefined,
      }),
    ).toEqual({
      ok: false,
      message: 'getaddrinfo ENOTFOUND proxy.corp.example',
    })
  })

  test('a request that cannot even be made is a failure', async () => {
    expect(
      await checkIotConnect({
        host: IOT_ENDPOINT,
        request: () => {
          throw new Error('bad proxy URL')
        },
        agentFor: () => undefined,
      }),
    ).toEqual({ ok: false, message: 'bad proxy URL' })
  })

  test('it connects to port 443 by name, through the proxy agent the relay would use', async () => {
    let seen
    const agent = { proxy: true }
    await checkIotConnect({
      host: IOT_ENDPOINT,
      agentFor: (url) => {
        expect(url).toBe(`wss://${IOT_ENDPOINT}/mqtt`)
        return agent
      },
      request: (options, onResponse) => {
        seen = options
        return request('answer')(options, onResponse)
      },
    })
    expect(seen).toMatchObject({
      host: IOT_ENDPOINT,
      port: 443,
      servername: IOT_ENDPOINT,
      method: 'GET',
      path: '/mqtt',
      agent,
      timeout: IOT_CONNECT_TIMEOUT_MS,
    })
  })

  test('the default agent follows HTTPS_PROXY from the environment it is given', async () => {
    let seen
    await checkIotConnect({
      host: IOT_ENDPOINT,
      env: { HTTPS_PROXY: 'http://proxy.example.com:3128' },
      request: (options, onResponse) => {
        seen = options
        return request('answer')(options, onResponse)
      },
    })
    expect(seen.agent?.proxy?.href).toBe('http://proxy.example.com:3128/')
    let direct
    await checkIotConnect({
      host: IOT_ENDPOINT,
      env: {},
      request: (options, onResponse) => {
        direct = options
        return request('answer')(options, onResponse)
      },
    })
    expect(direct.agent).toBeUndefined()
  })

  test('a request whose socket never arrives ends at the limit, aborted, with no live timer', async () => {
    const timers = countingTimers()
    let seen
    let destroyed = false
    const result = await checkIotConnect({
      host: IOT_ENDPOINT,
      timeoutMs: 30,
      timers,
      agentFor: () => undefined,
      // A proxy that accepts the connection and never answers CONNECT: no socket, no idle timeout.
      request: (options) => {
        seen = options
        const req = new EventEmitter()
        req.end = () => {}
        req.destroy = () => {
          destroyed = true
        }
        return req
      },
    })
    expect(result).toEqual({ ok: false, message: 'no answer within 0.03s' })
    expect(timers.live()).toBe(0)
    expect(seen.signal.aborted).toBe(true)
    expect(destroyed).toBe(true)
  })

  test('an answer clears the limit and ends the request', async () => {
    const timers = countingTimers()
    let seen
    expect(
      await checkIotConnect({
        host: IOT_ENDPOINT,
        timers,
        agentFor: () => undefined,
        request: (options, onResponse) => {
          seen = options
          return request('answer')(options, onResponse)
        },
      }),
    ).toEqual({ ok: true, status: 403 })
    expect(timers.live()).toBe(0)
    expect(seen.signal.aborted).toBe(true)
  })

  test('the proxy agent gets the signal that ends its connection to the proxy', async () => {
    let seen
    await checkIotConnect({
      host: IOT_ENDPOINT,
      env: { HTTPS_PROXY: 'http://proxy.example.com:3128' },
      request: (options, onResponse) => {
        seen = options
        return request('answer')(options, onResponse)
      },
    })
    expect(seen.agent.connectOpts.signal).toBe(seen.signal)
    expect(seen.signal.aborted).toBe(true)
  })

  test('behind a proxy that never answers, the result comes at the limit and the process can exit', async () => {
    // A proxy that accepts every connection and never answers.
    const accepted = new Set()
    const proxy = net.createServer((socket) => {
      accepted.add(socket)
      socket.on('error', () => {})
    })
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    const dryRunUrl = pathToFileURL(
      fileURLToPath(
        new URL(
          '../../../../../../../lib/plugins/aws/dev/commands/dry-run.js',
          import.meta.url,
        ),
      ),
    ).href
    const script = `
      const { checkIotConnect } = await import(${JSON.stringify(dryRunUrl)})
      const result = await checkIotConnect({ host: 'iot.example.com', timeoutMs: 300 })
      process.stdout.write(JSON.stringify(result))
    `
    try {
      const child = spawn(
        process.execPath,
        ['--input-type=module', '-e', script],
        {
          env: {
            ...process.env,
            NODE_OPTIONS: '',
            NO_PROXY: '',
            no_proxy: '',
            proxy: '',
            HTTP_PROXY: '',
            http_proxy: '',
            https_proxy: '',
            HTTPS_PROXY: `http://127.0.0.1:${proxy.address().port}`,
          },
          windowsHide: true,
        },
      )
      let output = ''
      let errors = ''
      child.stdout.on('data', (chunk) => (output += chunk))
      child.stderr.on('data', (chunk) => (errors += chunk))
      // The proxy keeps every connection open until the end of the test: the child exits only if
      // the check ended its own connection.
      // A child still running after 10 s is held open by the connection: it is ended and fails.
      const stuck = setTimeout(() => child.kill(), 10_000)
      const code = await new Promise((resolve) => child.on('exit', resolve))
      clearTimeout(stuck)
      expect({ code, errors }).toEqual({ code: 0, errors: '' })
      expect(JSON.parse(output)).toEqual({
        ok: false,
        message: 'no answer within 0.3s',
      })
      expect(accepted.size).toBeGreaterThan(0)
    } finally {
      for (const socket of accepted) socket.destroy()
      await new Promise((resolve) => proxy.close(resolve))
    }
  }, 30_000)
})
