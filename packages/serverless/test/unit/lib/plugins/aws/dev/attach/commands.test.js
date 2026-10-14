import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  devModeCommandHooks,
  restoreFunctionBeforeDeployFunction,
  restoreStageBeforeCommand,
  rollbackTargetExists,
  runDevRestore,
  runDevSetup,
} from '../../../../../../../lib/plugins/aws/dev/attach/commands.js'
import {
  buildPermissionPolicy,
  buildTrustPolicy,
} from '../../../../../../../lib/plugins/aws/dev/attach/broker.js'
import { buildAttachVariables } from '../../../../../../../lib/plugins/aws/dev/attach/undo-record.js'
import {
  ACCOUNT,
  fakeIam,
  fakeLambda,
  fakeLog,
  fakeProgress,
  fakeProvider,
  fakeServerless,
  recordingProgress,
  testSessionId,
} from './fakes.js'
import { droppedConnections } from './dropped-connections.js'
import { runWithoutColor } from '../without-color.js'
import { runnable } from '../commands/runnable.js'

// Its tests read the plain text of styled lines.
runWithoutColor()

let savedSuffix
beforeAll(() => {
  savedSuffix = process.env.SLS_DEV_TEST_SUFFIX
  delete process.env.SLS_DEV_TEST_SUFFIX
})
afterAll(() => {
  if (savedSuffix === undefined) delete process.env.SLS_DEV_TEST_SUFFIX
  else process.env.SLS_DEV_TEST_SUFFIX = savedSuffix
})

const NAME = 'serverless-dev-broker-us-east-1'
const BOUNDARY = 'arn:aws:iam::aws:policy/PowerUserAccess'
const setup = (options = {}, iam = fakeIam(), provider = fakeProvider()) => {
  const logger = fakeLog()
  return {
    iam,
    logger,
    run: () =>
      runDevSetup({
        provider,
        options,
        deps: { clients: { iam }, logger, progress: fakeProgress() },
      }),
  }
}
const denied = (action) =>
  Object.assign(new Error(`not authorized to perform: ${action}`), {
    name: 'AccessDenied',
  })

// What provider.request throws: a ServerlessError wrapping the AWS error (SDK v2: `code` and
// `statusCode`; SDK v3: `name` and `$metadata`).
const providerRequestError = (code, message, statusCode, { v3 = false } = {}) =>
  Object.assign(new Error(message), {
    name: 'ServerlessError',
    code: `AWS_S_T_S_GET_CALLER_IDENTITY_${code.toUpperCase()}`,
    providerError: v3
      ? {
          name: code,
          code,
          statusCode,
          $metadata: { httpStatusCode: statusCode },
        }
      : { code, statusCode, message },
  })
const identityFailing = (error) => ({
  ...fakeProvider(),
  getAccountInfo: async () => {
    throw error
  },
})

test('dev setup names sts:GetCallerIdentity when reading the caller identity is denied', async () => {
  for (const v3 of [false, true]) {
    const s = setup(
      {},
      fakeIam(),
      identityFailing(
        providerRequestError(
          'AccessDenied',
          'User is not authorized to perform: sts:GetCallerIdentity',
          403,
          { v3 },
        ),
      ),
    )
    const error = await s.run().catch((e) => e)
    expect(error.code).toBe('DEV_MODE_IDENTITY_ACCESS_DENIED')
    expect(error.message).toContain('sts:GetCallerIdentity')
    expect(error.message).toContain('us-east-1')
    expect(error.message).toContain('User is not authorized')
    expect(error.originalName).toBe('AccessDenied')
    expect(s.iam.calls).toEqual([])
  }
})

test('dev setup reports rejected credentials on the caller identity as such', async () => {
  for (const [code, v3] of [
    ['ExpiredToken', false],
    ['ExpiredTokenException', true],
  ]) {
    const s = setup(
      {},
      fakeIam(),
      identityFailing(
        providerRequestError(
          code,
          'The security token included in the request is expired',
          403,
          { v3 },
        ),
      ),
    )
    const error = await s.run().catch((e) => e)
    expect(error.code).toBe('DEV_MODE_AWS_CREDENTIALS_INVALID')
    expect(error.message).toContain('is expired')
    expect(error.message).not.toContain('iam:CreateRole')
    expect(s.iam.calls).toEqual([])
  }
})

test('dev setup reports any other caller identity error as is', async () => {
  const throttled = providerRequestError('Throttling', 'Rate exceeded', 400)
  const s = setup({}, fakeIam(), identityFailing(throttled))
  expect(await s.run().catch((e) => e)).toBe(throttled)
})

test('dev setup creates the broker role once', async () => {
  const s = setup()
  await s.run()
  expect(s.iam.calls.filter(([op]) => op === 'createRole')).toHaveLength(1)
  expect(s.logger.text()).toContain(
    `Dev Mode is set up in us-east-1: created IAM role arn:aws:iam::${ACCOUNT}:role/${NAME}`,
  )
})

test('dev setup on an existing role re-applies its policy and an optional boundary', async () => {
  const s = setup({ 'permissions-boundary': BOUNDARY })
  await setup({}, s.iam).run()
  await s.run()
  expect(s.iam.calls.filter(([op]) => op === 'createRole')).toHaveLength(1)
  expect(s.iam.calls.filter(([op]) => op === 'putRolePolicy')).toHaveLength(2)
  expect(s.iam.roles.get(NAME).PermissionsBoundary).toEqual({
    PermissionsBoundaryArn: BOUNDARY,
  })
})

test('dev setup on an existing role says what it changed', async () => {
  const s = setup({ 'permissions-boundary': BOUNDARY })
  await setup({}, s.iam).run()
  await s.run()
  const text = s.logger.text()
  expect(text).toContain(
    `Dev Mode is set up in us-east-1: IAM role arn:aws:iam::${ACCOUNT}:role/${NAME}`,
  )
  expect(text).toContain('serverless-dev-broker')
  expect(text).toContain(BOUNDARY)
})

describe('dev setup and the version of the permission policy', () => {
  const AT = {
    identity: { accountId: ACCOUNT, partition: 'aws' },
    region: 'us-east-1',
  }
  const withPolicy = async (doc) => {
    const iam = fakeIam()
    await setup({}, iam).run()
    iam.policies.set(`${NAME}/serverless-dev-broker`, doc)
    iam.calls.length = 0
    return iam
  }
  const puts = (iam) => iam.calls.filter(([op]) => op === 'putRolePolicy')

  test('an older version is overwritten in place', async () => {
    const iam = await withPolicy(buildPermissionPolicy({ ...AT, version: 0 }))
    const s = setup({}, iam)
    await s.run()
    expect(puts(iam)).toEqual([
      ['putRolePolicy', NAME, 'serverless-dev-broker'],
    ])
    expect(iam.policies.get(`${NAME}/serverless-dev-broker`)).toEqual(
      buildPermissionPolicy(AT),
    )
    expect(s.logger.text()).toContain(
      `Dev Mode is set up in us-east-1: IAM role arn:aws:iam::${ACCOUNT}:role/${NAME} (already existed; re-applied its permission policy serverless-dev-broker)`,
    )
  })

  test('without iam:GetRolePolicy, nothing is written and the error names it', async () => {
    const iam = await withPolicy(buildPermissionPolicy({ ...AT, version: 2 }))
    iam.getRolePolicyError = denied('iam:GetRolePolicy')
    const error = await setup({}, iam)
      .run()
      .catch((e) => e)
    expect(error.code).toBe('DEV_SETUP_ACCESS_DENIED')
    expect(error.message).toContain(
      `"serverless dev setup" needs iam:GetRole, iam:GetRolePolicy, iam:CreateRole and iam:PutRolePolicy on the IAM role arn:aws:iam::${ACCOUNT}:role/${NAME},`,
    )
    expect(puts(iam)).toEqual([])
  })

  test('the policy is read before the permissions boundary is set: a denied read changes nothing', async () => {
    const iam = await withPolicy(buildPermissionPolicy({ ...AT, version: 0 }))
    iam.getRolePolicyError = denied('iam:GetRolePolicy')
    const error = await setup({ 'permissions-boundary': BOUNDARY }, iam)
      .run()
      .catch((e) => e)
    expect(error.code).toBe('DEV_SETUP_ACCESS_DENIED')
    expect(iam.calls.filter(([op]) => op.startsWith('put'))).toEqual([])
    expect(iam.roles.get(NAME).PermissionsBoundary).toBeUndefined()
  })

  test('a newer version is kept, and the summary says so', async () => {
    const theirs = buildPermissionPolicy({ ...AT, version: 2 })
    const iam = await withPolicy(theirs)
    const s = setup({ 'permissions-boundary': BOUNDARY }, iam)
    await s.run()
    expect(puts(iam)).toEqual([])
    expect(iam.policies.get(`${NAME}/serverless-dev-broker`)).toEqual(theirs)
    expect(s.logger.text()).toContain(
      `Dev Mode is set up in us-east-1: IAM role arn:aws:iam::${ACCOUNT}:role/${NAME} (already existed; kept its permission policy serverless-dev-broker, which a newer version of Dev Mode wrote, and set the permissions boundary ${BOUNDARY})`,
    )
  })

  test('a denied write names what dev setup needs', async () => {
    const iam = await withPolicy(buildPermissionPolicy({ ...AT, version: 0 }))
    iam.putRolePolicyError = denied('iam:PutRolePolicy')
    const error = await setup({}, iam)
      .run()
      .catch((e) => e)
    expect(error.code).toBe('DEV_SETUP_ACCESS_DENIED')
    expect(error.message).toContain(
      `"serverless dev setup" needs iam:GetRole, iam:GetRolePolicy, iam:CreateRole and iam:PutRolePolicy on the IAM role arn:aws:iam::${ACCOUNT}:role/${NAME},`,
    )
    expect(error.message).not.toContain('DeleteRolePolicy')
  })
})

test('a denied dev setup names the role with the path it has or would have, and any path when GetRole is denied', async () => {
  // An existing role under a path: its own ARN.
  const pathed = fakeIam()
  await setup({ path: '/serverless/' }, pathed).run()
  pathed.putRolePolicyError = denied('iam:PutRolePolicy')
  pathed.policies.clear()
  const existing = await setup({}, pathed)
    .run()
    .catch((e) => e)
  expect(existing.message).toBe(
    'Your AWS credentials cannot set up Dev Mode in us-east-1 (not authorized to perform: iam:PutRolePolicy).\n' +
      `"serverless dev setup" needs iam:GetRole, iam:GetRolePolicy, iam:CreateRole and iam:PutRolePolicy on the IAM role arn:aws:iam::${ACCOUNT}:role/serverless/${NAME}, plus iam:PutRolePermissionsBoundary when --permissions-boundary is given.\n` +
      'Run it again with the credentials of an AWS administrator.',
  )
  // A role it would create under --path: the ARN it would have.
  const creating = fakeIam()
  creating.createRoleError = denied('iam:CreateRole')
  const create = await setup({ path: '/serverless/' }, creating)
    .run()
    .catch((e) => e)
  expect(create.message).toContain(
    `on the IAM role arn:aws:iam::${ACCOUNT}:role/serverless/${NAME},`,
  )
  // GetRole denied: where the role is cannot be known.
  const unread = fakeIam()
  unread.getRoleError = denied('iam:GetRole')
  const read = await setup({ path: '/serverless/' }, unread)
    .run()
    .catch((e) => e)
  expect(read.message).toContain(
    `on the IAM role "${NAME}" under any IAM path (arn:aws:iam::${ACCOUNT}:role/*serverless-dev-broker-*),`,
  )
})

test('dev setup refuses to move an existing role to another path', async () => {
  const iam = fakeIam()
  await setup({}, iam).run()
  await expect(setup({ path: '/custom/' }, iam).run()).rejects.toMatchObject({
    code: 'DEV_SETUP_PATH_MISMATCH',
  })
})

test.each(['custom', '/custom', 'custom/', '//', ''])(
  'dev setup rejects the IAM path %s before calling AWS',
  async (path) => {
    const s = setup({ path })
    await expect(s.run()).rejects.toMatchObject({
      code: 'DEV_SETUP_INVALID_PATH',
    })
    expect(s.iam.calls).toEqual([])
  },
)

test('dev setup writes the trust policy for the partition of the caller', async () => {
  const s = setup(
    {},
    fakeIam(),
    fakeProvider({
      region: 'us-gov-west-1',
      callerArn: `arn:aws-us-gov:sts::${ACCOUNT}:assumed-role/Admin/alice`,
    }),
  )
  await s.run()
  const role = s.iam.roles.get('serverless-dev-broker-us-gov-west-1')
  expect(
    JSON.parse(role.AssumeRolePolicyDocument).Statement[0].Condition.ArnLike,
  ).toEqual({
    'lambda:SourceFunctionArn': `arn:aws-us-gov:lambda:us-gov-west-1:${ACCOUNT}:function:*`,
  })
})

test.each([
  ['GetRole', 'getRoleError'],
  ['CreateRole', 'createRoleError'],
])(
  'a denied %s names every permission dev setup needs',
  async (action, field) => {
    const iam = fakeIam()
    iam[field] = denied(`iam:${action}`)
    const error = await setup({}, iam)
      .run()
      .catch((e) => e)
    expect(error.code).toBe('DEV_SETUP_ACCESS_DENIED')
    for (const permission of [
      'iam:GetRole',
      'iam:CreateRole',
      'iam:PutRolePolicy',
      'iam:PutRolePermissionsBoundary',
    ]) {
      expect(error.message).toContain(permission)
    }
    expect(error.message).toContain(`iam:${action}`)
    expect(error.message).not.toContain('Ask an administrator to run')
  },
)

test('a denied permissions boundary update is explained', async () => {
  const iam = fakeIam()
  await setup({}, iam).run()
  iam.putRolePermissionsBoundary = async () => {
    throw denied('iam:PutRolePermissionsBoundary')
  }
  await expect(
    setup({ 'permissions-boundary': BOUNDARY }, iam).run(),
  ).rejects.toMatchObject({ code: 'DEV_SETUP_ACCESS_DENIED' })
})

test('the setup lifecycle event runs dev setup', () => {
  const setupHandler = async () => {}
  expect(
    devModeCommandHooks({
      commandName: 'dev setup',
      handlers: {
        setup: setupHandler,
        restore: async () => {},
        restoreStage: () => async () => {},
        restoreFunction: async () => {},
      },
    })['dev:setup:setup'],
  ).toBe(setupHandler)
})

const writes = (iam) =>
  iam.calls
    .map(([op]) => op)
    .filter((op) => op !== 'getRole' && op !== 'createRole')
const teammateRole = (doc) => ({
  RoleName: NAME,
  Path: '/',
  Arn: `arn:aws:iam::${ACCOUNT}:role/${NAME}`,
  AssumeRolePolicyDocument: JSON.stringify(doc),
})
const trust = () =>
  buildTrustPolicy({
    identity: { accountId: ACCOUNT, partition: 'aws' },
    region: 'us-east-1',
    externalId: 'cd'.repeat(16),
  })

test('a teammate creating the role during setup: continue as for an existing role', async () => {
  const iam = fakeIam()
  const getRole = iam.getRole
  let reads = 0
  iam.getRole = async (name) => {
    reads += 1
    // The teammate's CreateRole lands between our GetRole and our CreateRole.
    if (reads === 1) {
      const nothing = await getRole(name)
      iam.roles.set(NAME, teammateRole(trust()))
      return nothing
    }
    return getRole(name)
  }
  const s = setup({}, iam)
  await s.run()
  expect(iam.calls.filter(([op]) => op === 'createRole')).toHaveLength(1)
  expect(s.logger.text()).toContain('(already existed;')
  expect(s.logger.text()).not.toContain('created IAM role')
  expect(iam.calls.filter(([op]) => op === 'putRolePolicy')).toHaveLength(1)
})

test('a role that exists but cannot be read back yet asks to run setup again', async () => {
  const iam = fakeIam()
  iam.roles.set(NAME, teammateRole(trust()))
  iam.getRole = async () => null
  await expect(setup({}, iam).run()).rejects.toMatchObject({
    code: 'DEV_SETUP_CONCURRENT',
  })
  expect(writes(iam)).toEqual([])
})

test('a foreign role is refused without writing, naming dev setup', async () => {
  const iam = fakeIam()
  iam.roles.set(NAME, teammateRole({ Statement: [{ Effect: 'Allow' }] }))
  const error = await setup({ 'permissions-boundary': BOUNDARY }, iam)
    .run()
    .catch((e) => e)
  expect(error.code).toBe('DEV_MODE_BROKER_FOREIGN')
  expect(error.message).toContain('"serverless dev setup"')
  expect(writes(iam)).toEqual([])
})

test('a changed trust policy is refused without writing', async () => {
  const iam = fakeIam()
  const doc = trust()
  delete doc.Statement[0].Condition.StringEquals['aws:PrincipalAccount']
  iam.roles.set(NAME, teammateRole(doc))
  await expect(
    setup({ 'permissions-boundary': BOUNDARY }, iam).run(),
  ).rejects.toMatchObject({ code: 'DEV_MODE_BROKER_MODIFIED' })
  expect(writes(iam)).toEqual([])
})

test('a path mismatch with a boundary writes nothing', async () => {
  const iam = fakeIam()
  await setup({}, iam).run()
  iam.calls.length = 0
  await expect(
    setup({ path: '/custom/', 'permissions-boundary': BOUNDARY }, iam).run(),
  ).rejects.toMatchObject({ code: 'DEV_SETUP_PATH_MISMATCH' })
  expect(writes(iam)).toEqual([])
})

test.each([
  ['NoSuchEntityException', 404, 'DEV_MODE_BROKER_BOUNDARY_INVALID'],
  ['InvalidInputException', 400, 'DEV_MODE_BROKER_BOUNDARY_INVALID'],
  ['ExpiredTokenException', 403, 'DEV_MODE_AWS_CREDENTIALS_INVALID'],
])(
  '%s from PutRolePermissionsBoundary is explained',
  async (name, status, code) => {
    const iam = fakeIam()
    await setup({}, iam).run()
    iam.putRolePermissionsBoundary = async () => {
      throw Object.assign(new Error('refused'), {
        name,
        $metadata: { httpStatusCode: status },
      })
    }
    const error = await setup({ 'permissions-boundary': BOUNDARY }, iam)
      .run()
      .catch((e) => e)
    expect(error.code).toBe(code)
    if (code === 'DEV_MODE_BROKER_BOUNDARY_INVALID') {
      expect(error.message).toContain(BOUNDARY)
    }
  },
)

const DEV_LAYER = `arn:aws:lambda:us-east-1:${ACCOUNT}:layer:serverless-dev-arm64:1`
const UNREADABLE = { Error: { ErrorCode: 'KMSAccessDeniedException' } }
const SDK_LAYER = `arn:aws:lambda:us-east-1:${ACCOUNT}:layer:sls-sdk-node-v0-15-15:1`
const attachedConfig = (
  owner = 'alice@mbp',
  live = { TABLE: 'orders' },
  otherLayerArns = [],
) => ({
  Layers: [{ Arn: DEV_LAYER }],
  Environment: {
    Variables: buildAttachVariables({
      live,
      otherLayerArns,
      session: {
        id: 's_old',
        owner,
        attachedAt: 1790000000,
        broker: {
          arn: `arn:aws:iam::${ACCOUNT}:role/b`,
          externalId: 'e'.repeat(32),
        },
      },
    }),
  },
})
const restoreSetup = ({
  live = {},
  options = {},
  stage = 'dev',
  region = 'us-east-1',
} = {}) => {
  const serverless = fakeServerless({
    stage,
    functions: { api: {}, worker: {} },
  })
  const lambda = fakeLambda({
    [`svc-${stage}-api`]: {},
    [`svc-${stage}-worker`]: {},
    'other-app-fn': attachedConfig('bob@desk'),
    ...live,
  })
  const logger = fakeLog()
  const deps = {
    clients: { lambda },
    logger,
    progress: fakeProgress(),
    sleep: async () => {},
    now: () => 1790000000 * 1000 + 600_000,
  }
  return {
    serverless,
    lambda,
    logger,
    deps,
    options,
    provider: fakeProvider({ stage, region }),
  }
}
const levels = (logger) => logger.lines.map((line) => line.level)
const updated = (lambda) =>
  lambda.calls
    .filter(([op]) => op === 'updateFunctionConfiguration')
    .map(([, params]) => params.FunctionName)
const deniedGet = () =>
  Object.assign(
    new Error(
      'User is not authorized to perform: lambda:GetFunction on resource: svc-dev-api',
    ),
    { name: 'AccessDeniedException', $metadata: { httpStatusCode: 403 } },
  )
const expired = () =>
  Object.assign(
    new Error('The security token included in the request is expired'),
    {
      name: 'ExpiredTokenException',
      $metadata: { httpStatusCode: 403 },
    },
  )
// Every read of a function fails, or only the reads of `only`.
const failingGet = (s, error, only) => {
  const getFunction = s.lambda.getFunction
  s.lambda.getFunction = async (name) => {
    if (!only || only.includes(name)) throw error
    return getFunction(name)
  }
}
const reads = (lambda) =>
  lambda.calls.map(([op, name]) => `${op} ${name}`).sort()

test('dev restore restores this stage only and exits 0', async () => {
  const s = restoreSetup({ live: { 'svc-dev-api': attachedConfig() } })
  expect(await runDevRestore(s)).toBe(0)
  expect(s.lambda.state.get('svc-dev-api').Environment.Variables).toEqual({
    TABLE: 'orders',
  })
  expect(s.lambda.state.get('svc-dev-api').Layers).toEqual([])
  expect(
    s.lambda.state.get('other-app-fn').Environment.Variables.SLS_DEV_SESSION,
  ).toBe('s_old')
  expect(updated(s.lambda)).toEqual(['svc-dev-api'])
  const text = s.logger.text()
  expect(s.logger.lines.slice(0, 2)).toEqual([
    {
      level: 'aside',
      text: 'Functions with Dev Mode configuration on stage "dev":',
    },
    {
      level: 'aside',
      text: '  svc-dev-api  (alice@mbp, attached 10 min ago)',
    },
  ])
  expect(text).toMatch(/Dev Mode off · 1 function restored \(\d+\.\ds\)/)
  expect(s.logger.lines.at(-1).level).toBe('success')
})

test('dev restore with nothing to do says so', async () => {
  const s = restoreSetup()
  expect(await runDevRestore(s)).toBe(0)
  expect(s.logger.text()).toBe(
    'No function on stage "dev" has Dev Mode configuration.',
  )
  expect(updated(s.lambda)).toEqual([])
})

test('dev restore refuses while this directory runs a session of its stage; another stage is restored', async () => {
  const s = restoreSetup({ live: { 'svc-dev-api': attachedConfig() } })
  // The live session here (a starting one, without its endpoint yet, counts too).
  const running = (stage) => async () => ({
    session_id: testSessionId(1),
    pid: 4123,
    stage,
    region: 'us-east-1',
    control: null,
  })
  await expect(
    runDevRestore({ ...s, deps: { ...s.deps, sessionHere: running('dev') } }),
  ).rejects.toMatchObject({
    code: 'DEV_MODE_SESSION_RUNNING',
    message: `A Dev Mode session of this stage is running here (session ${testSessionId(1)}, pid 4123); it restores its functions when it stops. Stop it first with "serverless dev stop".`,
    next: [
      { command: 'serverless dev stop', when: 'to end the running session' },
    ],
  })
  expect(s.lambda.calls).toEqual([])
  // A session no command can reach: the refusal says how to stop it, and restore comes after.
  await expect(
    runDevRestore({
      ...s,
      deps: {
        ...s.deps,
        sessionHere: async () => ({
          ...(await running('dev')()),
          state: 'on',
          control_unavailable: true,
        }),
      },
    }),
  ).rejects.toMatchObject({
    code: 'DEV_MODE_SESSION_RUNNING',
    message: expect.stringContaining('Stop it with Ctrl+C in its terminal'),
    next: [
      {
        command: 'serverless dev restore --stage dev --region us-east-1',
        when: 'after stopping that session with Ctrl+C in its terminal',
      },
    ],
  })
  expect(s.lambda.calls).toEqual([])
  expect(
    await runDevRestore({
      ...s,
      deps: { ...s.deps, sessionHere: running('other') },
    }),
  ).toBe(0)
  expect(updated(s.lambda)).toEqual(['svc-dev-api'])
})

test('dev restore reads the session file here: a starting session of its stage blocks it', async () => {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  try {
    const s = restoreSetup({ live: { 'svc-dev-api': attachedConfig() } })
    s.serverless.serviceDir = serviceDir
    const dir = path.join(serviceDir, '.serverless', 'dev')
    fs.mkdirSync(dir, { recursive: true })
    // A session still starting: its process runs (this test's parent) and it has no endpoint yet.
    fs.writeFileSync(
      path.join(dir, 'session.json'),
      JSON.stringify({
        v: 1,
        session_id: testSessionId(1),
        pid: process.ppid,
        state: 'starting',
        stage: 'dev',
        region: 'us-east-1',
        started_at: new Date().toISOString(),
        control: null,
      }),
    )
    await expect(runDevRestore(s)).rejects.toMatchObject({
      code: 'DEV_MODE_SESSION_RUNNING',
    })
    expect(s.lambda.calls).toEqual([])
    // A session file that names a process that is gone does not block it.
    fs.writeFileSync(
      path.join(dir, 'session.json'),
      JSON.stringify({
        v: 1,
        session_id: testSessionId(1),
        pid: 2 ** 22 + 1,
        state: 'on',
        stage: 'dev',
        region: 'us-east-1',
        control: null,
      }),
    )
    expect(await runDevRestore(s)).toBe(0)
    expect(updated(s.lambda)).toEqual(['svc-dev-api'])
  } finally {
    fs.rmSync(serviceDir, { recursive: true, force: true })
  }
})

test('dev restore --function limits it, and a failure exits 3', async () => {
  const s = restoreSetup({
    live: {
      'svc-dev-api': attachedConfig(),
      'svc-dev-worker': attachedConfig(),
    },
    options: { function: ['worker'] },
  })
  s.lambda.updateErrors.push(
    Object.assign(new Error('Rate exceeded'), { name: 'ServiceException' }),
  )
  expect(await runDevRestore(s)).toBe(3)
  const text = s.logger.text()
  expect(text).toContain(
    '1 function not restored: svc-dev-worker (Rate exceeded).',
  )
  expect(text).toContain('Restore incomplete · 0 of 1 function restored (')
  expect(text).not.toContain('Dev Mode off')
  expect(text).not.toContain('svc-dev-api')
  expect(
    s.lambda.state.get('svc-dev-api').Environment.Variables.SLS_DEV_SESSION,
  ).toBe('s_old')
})

test('a restore left incomplete on a personal stage suggests the restore of that stage and region', async () => {
  const s = restoreSetup({
    stage: 'alice',
    region: 'eu-west-1',
    live: { 'svc-alice-api': attachedConfig() },
  })
  s.lambda.updateErrors.push(
    Object.assign(new Error('Rate exceeded'), { name: 'ServiceException' }),
  )
  expect(await runDevRestore(s)).toBe(3)
  expect(s.logger.text()).toContain(
    'It runs the deployed code until restored: run "serverless dev restore --stage alice --region eu-west-1 --function api".',
  )
})

test('before deploy, a check that fails on a personal stage names that stage and region', async () => {
  const s = restoreSetup({ stage: 'alice', region: 'eu-west-1' })
  failingGet(s, new Error('socket hang up'))
  await restoreStageBeforeCommand({
    ...s,
    verb: 'deploy',
    devModeRanHere: true,
  })
  expect(levels(s.logger)).toEqual(['warning'])
  expect(s.logger.text()).toBe(
    'Could not check this stage for Dev Mode configuration (socket hang up). If functions still have it, run "serverless dev restore --stage alice --region eu-west-1".',
  )
})

test('dev restore and the deploy check run with --aws-profile suggest a restore with that profile', async () => {
  const s = restoreSetup({
    stage: 'alice',
    region: 'eu-west-1',
    live: { 'svc-alice-api': attachedConfig() },
  })
  s.provider.options = { 'aws-profile': 'sandbox' }
  s.lambda.updateErrors.push(
    Object.assign(new Error('Rate exceeded'), { name: 'ServiceException' }),
  )
  expect(await runDevRestore(s)).toBe(3)
  expect(s.logger.text()).toContain(
    'It runs the deployed code until restored: run "serverless dev restore --stage alice --region eu-west-1 --aws-profile sandbox --function api".',
  )
  const check = restoreSetup({ stage: 'alice', region: 'eu-west-1' })
  check.provider.options = { 'aws-profile': 'sandbox' }
  failingGet(check, new Error('socket hang up'))
  await restoreStageBeforeCommand({
    ...check,
    verb: 'deploy',
    devModeRanHere: true,
  })
  expect(check.logger.text()).toContain(
    'run "serverless dev restore --stage alice --region eu-west-1 --aws-profile sandbox".',
  )
})

test('dev restore and the deploy check run with --config suggest a restore with that file', async () => {
  const s = restoreSetup({
    stage: 'alice',
    region: 'eu-west-1',
    live: { 'svc-alice-api': attachedConfig() },
  })
  // A service run from its parent directory: `serverless dev restore --config sub/serverless.yml`.
  s.provider.options = { config: 'sub/serverless.yml' }
  s.lambda.updateErrors.push(
    Object.assign(new Error('Rate exceeded'), { name: 'ServiceException' }),
  )
  expect(await runDevRestore(s)).toBe(3)
  expect(s.logger.text()).toContain(
    'It runs the deployed code until restored: run "serverless dev restore --stage alice --region eu-west-1 --function api --config sub/serverless.yml".',
  )
  // A deploy of one service from a Compose root that named its Compose file.
  const check = restoreSetup({ stage: 'alice', region: 'eu-west-1' })
  check.provider.options = {}
  check.provider.serverless = {
    compose: {
      isWithinCompose: true,
      serviceName: 'consumer',
      configFile: 'compose/shop.yml',
    },
  }
  failingGet(check, new Error('socket hang up'))
  await restoreStageBeforeCommand({
    ...check,
    verb: 'deploy',
    devModeRanHere: true,
  })
  expect(check.logger.text()).toContain(
    'run "serverless consumer dev restore --stage alice --region eu-west-1 --config compose/shop.yml".',
  )
})

test('dev restore --function with nothing to restore names the function', async () => {
  const s = restoreSetup({
    live: { 'svc-dev-api': attachedConfig() },
    options: { function: 'worker' },
  })
  expect(await runDevRestore(s)).toBe(0)
  expect(s.logger.text()).toBe(
    'Function worker on stage "dev" has no Dev Mode configuration.',
  )
})

test('dev restore refuses a function that is not in serverless.yml', async () => {
  const s = restoreSetup({ options: { function: ['nope'] } })
  await expect(runDevRestore(s)).rejects.toMatchObject({
    code: 'DEV_MODE_UNKNOWN_FUNCTION',
  })
  expect(s.lambda.calls).toEqual([])
})

test('dev restore counts only functions it really changed back', async () => {
  const s = restoreSetup({
    live: {
      'svc-dev-api': attachedConfig(),
      'svc-dev-worker': attachedConfig(),
    },
  })
  // A teammate's restore lands between the listing and ours.
  const getFunction = s.lambda.getFunction
  s.lambda.getFunction = async (name) => {
    if (name === 'svc-dev-worker') {
      s.lambda.state.set(name, {
        ...s.lambda.state.get(name),
        Layers: [],
        Environment: { Variables: { TABLE: 'orders' } },
      })
    }
    return getFunction(name)
  }
  expect(await runDevRestore(s)).toBe(0)
  expect(s.logger.text()).toContain('Dev Mode off · 1 function restored (')
})

test('dev restore shows notes, and never writes a function whose variables it cannot read', async () => {
  const s = restoreSetup({
    live: {
      // The layer that provided the original wrapper was removed while attached.
      'svc-dev-api': attachedConfig(
        'alice@mbp',
        { AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh' },
        [SDK_LAYER],
      ),
      'svc-dev-worker': {
        Layers: [{ Arn: DEV_LAYER }],
        Environment: UNREADABLE,
      },
    },
  })
  expect(await runDevRestore(s)).toBe(3)
  const text = s.logger.text()
  expect(text).toMatch(
    /svc-dev-worker\s+\(Dev Mode layer attached; .*kms:Decrypt/,
  )
  expect(text).toContain(
    '  svc-dev-api: its exec wrapper /opt/sls-sdk-node/exec-wrapper.sh was not put back',
  )
  expect(text).toMatch(
    /1 function not restored: svc-dev-worker \(.*kms:Decrypt/,
  )
  expect(updated(s.lambda)).toEqual(['svc-dev-api'])
})

test('a person running dev restore without lambda:GetFunction gets an error naming it', async () => {
  const s = restoreSetup()
  failingGet(s, deniedGet())
  const error = await runDevRestore(s).catch((e) => e)
  expect(error.code).toBe('DEV_RESTORE_ACCESS_DENIED')
  expect(error.message).toContain('lambda:GetFunction')
  expect(error.message).not.toContain('ListFunctions')
  expect(error.message).toContain('lambda:UpdateFunctionConfiguration')
})

test('dev restore with expired credentials says to refresh them', async () => {
  const s = restoreSetup()
  failingGet(s, expired())
  await expect(runDevRestore(s)).rejects.toMatchObject({
    code: 'DEV_MODE_AWS_CREDENTIALS_INVALID',
  })
})

describe('dev restore --json', () => {
  const NONE = { restored: 0, unchanged: 0, skipped: 0, missing: 0, failed: 0 }
  /** A stdout that keeps what is written to it. */
  const stdout = () => ({
    written: [],
    write(text) {
      this.written.push(text)
    },
  })
  /**
   * Runs `dev restore` with these options (and `json`) and without: the exit code (or the error),
   * the one JSON result on stdout, and the text, which is the same both ways.
   */
  const both = async (setupArgs, json = true, deps = {}) => {
    const runOnce = async (options) => {
      const s = restoreSetup(setupArgs)
      if (setupArgs.deniedGet) failingGet(s, deniedGet())
      if (setupArgs.failNames) {
        // Every update of these functions fails; the others go through.
        const update = s.lambda.updateFunctionConfiguration
        s.lambda.updateFunctionConfiguration = async (params) => {
          if (setupArgs.failNames.includes(params.FunctionName)) {
            throw Object.assign(new Error('Rate exceeded'), {
              name: 'ServiceException',
            })
          }
          return update(params)
        }
      }
      if (setupArgs.providerOptions) {
        s.provider.options = setupArgs.providerOptions
      }
      const out = stdout()
      let code
      let error
      try {
        code = await runDevRestore({
          ...s,
          options: { ...s.options, ...options },
          deps: { ...s.deps, ...deps, stdout: out },
        })
      } catch (e) {
        error = e
      }
      return { code, error, written: out.written, lines: s.logger.lines, s }
    }
    const withJson = await runOnce({ json })
    const without = await runOnce({})
    // The text a person reads does not change with --json.
    expect(withJson.lines).toEqual(without.lines)
    expect(withJson.code).toBe(without.code)
    expect(withJson.error?.code).toBe(without.error?.code)
    expect(without.written).toEqual([])
    return {
      ...withJson,
      result:
        withJson.written.length === 1 && withJson.written[0].endsWith('\n')
          ? JSON.parse(withJson.written[0])
          : withJson.written,
    }
  }

  test('every function restored: ok, exit 0, the restore counts', async () => {
    const { code, result } = await both({
      live: {
        'svc-dev-api': attachedConfig(),
        'svc-dev-worker': attachedConfig(),
      },
    })
    expect(code).toBe(0)
    expect(result).toEqual({
      v: 1,
      status: 'ok',
      message: 'Dev Mode off · 2 functions restored.',
      restore: { ...NONE, restored: 2 },
      exit_code: 0,
    })
  })

  test('nothing to restore: ok, exit 0, nothing counted', async () => {
    const { code, result } = await both({})
    expect(code).toBe(0)
    expect(result).toEqual({
      v: 1,
      status: 'ok',
      message: 'No function on stage "dev" has Dev Mode configuration.',
      restore: NONE,
      exit_code: 0,
    })
  })

  test('a function not restored: restore_incomplete, exit 3, the restore of only that function next', async () => {
    const { code, result } = await both({
      stage: 'alice',
      region: 'eu-west-1',
      live: {
        'svc-alice-api': attachedConfig(),
        'svc-alice-worker': attachedConfig(),
      },
      failNames: ['svc-alice-worker'],
    })
    expect(code).toBe(3)
    expect(result).toEqual({
      v: 1,
      status: 'error',
      reason: 'restore_incomplete',
      message: '1 function not restored: svc-alice-worker (Rate exceeded).',
      next: [
        {
          command:
            'serverless dev restore --stage alice --region eu-west-1 --function worker',
          when: 'to try again the functions that were not restored',
        },
      ],
      restore: { ...NONE, restored: 1, failed: 1 },
      exit_code: 3,
    })
    // An agent runs a next step with --json added.
    expect(runnable(`${result.next[0].command} --json`)).toEqual({
      command: 'dev restore',
      options: {
        stage: 'alice',
        region: 'eu-west-1',
        function: ['worker'],
        json: true,
      },
    })
  })

  test('--function api failing: next retries api only, never the whole stage', async () => {
    const { code, result, s } = await both({
      live: {
        'svc-dev-api': attachedConfig(),
        'svc-dev-worker': attachedConfig(),
      },
      options: { function: ['api'] },
      failNames: ['svc-dev-api'],
    })
    expect(code).toBe(3)
    expect(result).toMatchObject({
      reason: 'restore_incomplete',
      next: [
        {
          command:
            'serverless dev restore --stage dev --region us-east-1 --function api',
        },
      ],
      restore: { ...NONE, failed: 1 },
    })
    // The text suggests the same retry as next.
    expect(s.logger.text()).toContain(
      `It runs the deployed code until restored: run "${result.next[0].command}".`,
    )
    // worker was not asked for, and stays in Dev Mode.
    expect(
      s.lambda.state.get('svc-dev-worker').Environment.Variables
        .SLS_DEV_SESSION,
    ).toBe('s_old')
  })

  test('several functions failing: next names each of them and nothing else', async () => {
    const { result } = await both({
      live: {
        'svc-dev-api': attachedConfig(),
        'svc-dev-worker': attachedConfig(),
      },
      failNames: ['svc-dev-api', 'svc-dev-worker'],
    })
    expect(result.restore).toEqual({ ...NONE, failed: 2 })
    const { command, options } = runnable(`${result.next[0].command} --json`)
    expect(command).toBe('dev restore')
    expect({ ...options, function: [...options.function].sort() }).toEqual({
      stage: 'dev',
      region: 'us-east-1',
      function: ['api', 'worker'],
      json: true,
    })
  })

  test('next keeps the --aws-profile and --config the restore ran with', async () => {
    const { result } = await both({
      stage: 'alice',
      region: 'eu-west-1',
      live: { 'svc-alice-api': attachedConfig() },
      failNames: ['svc-alice-api'],
      providerOptions: {
        'aws-profile': 'sandbox',
        config: 'sub/serverless.yml',
      },
    })
    expect(result.next[0].command).toBe(
      'serverless dev restore --stage alice --region eu-west-1 --aws-profile sandbox --function api --config sub/serverless.yml',
    )
  })

  test('--function restores only those functions and counts only them', async () => {
    const { code, result, s } = await both({
      live: {
        'svc-dev-api': attachedConfig(),
        'svc-dev-worker': attachedConfig(),
      },
      options: { function: ['worker'] },
    })
    expect(code).toBe(0)
    expect(result).toMatchObject({
      status: 'ok',
      restore: { ...NONE, restored: 1 },
    })
    expect(updated(s.lambda)).toEqual(['svc-dev-worker'])
    const none = await both({ options: { function: ['worker'] } })
    expect(none.result).toMatchObject({
      status: 'ok',
      message: 'Function worker on stage "dev" has no Dev Mode configuration.',
      restore: NONE,
    })
  })

  test('refused while a session of this stage runs here: session_running, exit 1, stop it next', async () => {
    const running = async () => ({
      session_id: testSessionId(1),
      pid: 4123,
      stage: 'dev',
      region: 'us-east-1',
      control: null,
    })
    const { error, result, s } = await both({}, true, { sessionHere: running })
    expect(error.code).toBe('DEV_MODE_SESSION_RUNNING')
    expect(result).toEqual({
      v: 1,
      status: 'error',
      reason: 'session_running',
      message: error.message,
      next: [
        { command: 'serverless dev stop', when: 'to end the running session' },
      ],
      restore: NONE,
      exit_code: 1,
    })
    expect(s.lambda.calls).toEqual([])
    // A session no command can reach: the restore after Ctrl+C there takes --json too.
    const unreachable = await both({}, true, {
      sessionHere: async () => ({
        ...(await running()),
        state: 'on',
        control_unavailable: true,
      }),
    })
    expect(unreachable.result).toMatchObject({
      reason: 'session_running',
      next: [
        {
          command: 'serverless dev restore --stage dev --region us-east-1',
          when: 'after stopping that session with Ctrl+C in its terminal',
        },
      ],
    })
    expect(
      runnable(`${unreachable.result.next[0].command} --json`).options.json,
    ).toBe(true)
  })

  test('a missing permission is action_required; another error keeps its reason', async () => {
    const denied = await both({ deniedGet: true })
    expect(denied.error.code).toBe('DEV_RESTORE_ACCESS_DENIED')
    expect(denied.result).toEqual({
      v: 1,
      status: 'action_required',
      reason: 'permission_denied',
      message: denied.error.message,
      user_action_required: true,
      restore: NONE,
      exit_code: 1,
    })
    const unknown = await both({ options: { function: ['nope'] } })
    expect(unknown.error.code).toBe('DEV_MODE_UNKNOWN_FUNCTION')
    expect(unknown.result).toMatchObject({
      status: 'error',
      reason: 'error',
      exit_code: 1,
    })
  })

  test.each([false, 'false', '0'])(
    '--json=%s prints no JSON, as without the flag',
    async (json) => {
      const { code, written } = await both(
        { live: { 'svc-dev-api': attachedConfig() } },
        json,
      )
      expect(code).toBe(0)
      expect(written).toEqual([])
    },
  )
})

test('without devModeRanHere, the check reads .serverless/dev in the service directory', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-ran-'))
  try {
    const s = restoreSetup()
    s.serverless.serviceDir = dir
    failingGet(s, new Error('socket hang up'))
    await restoreStageBeforeCommand({ ...s, verb: 'removal' })
    expect(levels(s.logger)).toEqual(['debug'])
    fs.mkdirSync(path.join(dir, '.serverless', 'dev'), { recursive: true })
    const again = restoreSetup()
    again.serverless.serviceDir = dir
    failingGet(again, new Error('socket hang up'))
    await restoreStageBeforeCommand({ ...again, verb: 'removal' })
    expect(levels(again.logger)).toEqual(['warning'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('the checks before deploy, remove, rollback and deploy function', () => {
  // Dev Mode's real clients over a Lambda whose every call fails with `error()`; the attempts made
  // per function, and every wait asked for.
  const failingSdk = (s, error) => {
    const attempts = {}
    const waits = []
    const send = async (command) => {
      const name = command.input?.FunctionName
      attempts[name] = (attempts[name] ?? 0) + 1
      throw error()
    }
    const { clients, ...deps } = s.deps
    return {
      s: {
        ...s,
        deps: {
          ...deps,
          sleep: async (ms) => {
            waits.push(ms)
          },
          sdk: { lambda: { send }, iam: { send }, iot: { send } },
        },
      },
      attempts,
      waits,
    }
  }
  const refused = () =>
    Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), {
      code: 'ECONNREFUSED',
    })
  const timedOut = () =>
    Object.assign(new Error('socket hang up'), { name: 'TimeoutError' })
  const serverError = () =>
    Object.assign(new Error('internal'), {
      name: 'ServiceException',
      $metadata: { httpStatusCode: 500 },
    })
  const throttled = () =>
    Object.assign(new Error('Rate exceeded'), {
      name: 'TooManyRequestsException',
      retryAfterSeconds: '30',
      $metadata: { httpStatusCode: 429 },
    })
  const deniedRead = () =>
    Object.assign(
      new Error(
        'User is not authorized to perform: lambda:GetFunction on resource: svc-dev-api',
      ),
      { name: 'AccessDeniedException', $metadata: { httpStatusCode: 403 } },
    )

  test.each([
    ['a refused connection: 1 attempt per function', refused, 1],
    ['an SDK timeout: 1 attempt per function', timedOut, 1],
    ['a server error: 2 attempts per function', serverError, 2],
    ['throttling: 3 attempts per function', throttled, 3],
  ])('%s', async (_, error, n) => {
    const { s, attempts } = failingSdk(restoreSetup(), error)
    await restoreStageBeforeCommand({
      ...s,
      verb: 'deploy',
      devModeRanHere: true,
    })
    expect(attempts).toEqual({ 'svc-dev-api': n, 'svc-dev-worker': n })
  })

  // What a person sees at the default level; main prints nothing for these.
  const shown = (logger) =>
    logger.lines.filter((line) => line.level !== 'debug')

  test('a Lambda endpoint whose network drops the packets costs the checks seconds, and a debug line only', async () => {
    // Dev Mode's real SDK clients, as the commands build them.
    const withRealClients = () => {
      const s = restoreSetup()
      const { clients, ...deps } = s.deps
      return { ...s, deps }
    }
    const stage = withRealClients()
    const one = withRealClients()
    const dropped = droppedConnections()
    const started = performance.now()
    let connections
    try {
      await Promise.all([
        restoreStageBeforeCommand({
          ...stage,
          verb: 'removal',
          devModeRanHere: false,
        }),
        restoreFunctionBeforeDeployFunction({
          ...one,
          functionKey: 'api',
          devModeRanHere: false,
        }),
      ])
    } finally {
      connections = dropped.mock.calls.length
      dropped.mockRestore()
    }
    expect(performance.now() - started).toBeLessThan(10_000)
    expect(connections).toBeGreaterThan(0)
    for (const { logger } of [stage, one]) {
      expect(shown(logger)).toEqual([])
      expect(levels(logger)).toEqual(['debug'])
      expect(logger.text()).toContain('did not establish a connection')
    }
  }, 20_000)

  describe.each([
    ['refused', refused],
    ['throttled', throttled],
    ['denied', deniedRead],
  ])('a check that is %s', (kind, error) => {
    test.each(['deploy', 'removal', 'rollback'])(
      'before %s, without .serverless/dev here: a debug line only, as on a stage Dev Mode never ran on',
      async (verb) => {
        const progress = recordingProgress()
        const { s } = failingSdk(restoreSetup(), error)
        await restoreStageBeforeCommand({
          ...s,
          deps: { ...s.deps, progress },
          verb,
          timestamp: verb === 'rollback' ? '1' : undefined,
          devModeRanHere: false,
        })
        expect(shown(s.logger)).toEqual([])
        expect(levels(s.logger)).toEqual(['debug'])
        expect(progress.texts()).toEqual([])
      },
    )

    test('before deploy function, without .serverless/dev here: a debug line only', async () => {
      const progress = recordingProgress()
      const { s } = failingSdk(restoreSetup(), error)
      await restoreFunctionBeforeDeployFunction({
        ...s,
        deps: { ...s.deps, progress },
        functionKey: 'api',
        devModeRanHere: false,
      })
      expect(shown(s.logger)).toEqual([])
      expect(levels(s.logger)).toEqual(['debug'])
      expect(progress.texts()).toEqual([])
    })

    test('with .serverless/dev here: the warning', async () => {
      const { s } = failingSdk(restoreSetup(), error)
      await restoreStageBeforeCommand({
        ...s,
        verb: 'deploy',
        devModeRanHere: true,
      })
      const { s: one } = failingSdk(restoreSetup(), error)
      await restoreFunctionBeforeDeployFunction({
        ...one,
        functionKey: 'api',
        devModeRanHere: true,
      })
      expect(levels(s.logger)).toEqual(['warning'])
      expect(levels(one.logger)).toEqual(['warning'])
      if (kind === 'denied') {
        expect(s.logger.text()).toContain('Dev Mode check skipped')
        expect(one.logger.text()).toContain('Dev Mode check skipped')
        return
      }
      expect(s.logger.text()).toContain(
        'Could not check this stage for Dev Mode configuration',
      )
      expect(levels(one.logger)).toEqual(['warning'])
      expect(one.logger.text()).toContain(
        'Could not check "api" for Dev Mode configuration',
      )
    })
  })

  test('a throttled check waits at most a second at a time and stops at the first function it could not read', async () => {
    const functions = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`fn${i}`, {}]),
    )
    const { s, attempts, waits } = failingSdk(
      {
        ...restoreSetup(),
        serverless: fakeServerless({ stage: 'dev', functions }),
      },
      throttled,
    )
    await restoreStageBeforeCommand({
      ...s,
      verb: 'deploy',
      devModeRanHere: true,
    })
    // One batch of reads in parallel at most, each with 2 retries and waits of at most a second
    // whatever retry-after the throttle names: about 2 seconds in all.
    const read = Object.keys(attempts)
    expect(read.length).toBeLessThanOrEqual(10)
    for (const name of read) expect(attempts[name]).toBe(3)
    expect(waits).toHaveLength(read.length * 2)
    for (const ms of waits) expect(ms).toBeLessThanOrEqual(1_000)
    expect(s.logger.text()).toContain('(Rate exceeded)')
  })

  test('deploy function: one attempt on a network error', async () => {
    const { s, attempts } = failingSdk(restoreSetup(), refused)
    await restoreFunctionBeforeDeployFunction({
      ...s,
      functionKey: 'api',
      devModeRanHere: true,
    })
    expect(attempts).toEqual({ 'svc-dev-api': 1 })
    expect(s.logger.text()).toContain(
      'Could not check "api" for Dev Mode configuration',
    )
  })

  test('dev restore keeps the full policy: 8 attempts on a network error', async () => {
    const { s, attempts } = failingSdk(restoreSetup(), refused)
    await runDevRestore(s).catch(() => {})
    expect(attempts).toEqual({ 'svc-dev-api': 8, 'svc-dev-worker': 8 })
  })
})

describe('a layer named like Dev Mode on a function Dev Mode did not attach', () => {
  const SAME_NAME = `arn:aws:lambda:us-east-1:${ACCOUNT}:layer:serverless-dev-x86_64:7`
  const sameNameConfig = () => ({
    FunctionArn: `arn:aws:lambda:us-east-1:${ACCOUNT}:function:svc-dev-api`,
    Layers: [{ Arn: SAME_NAME }],
    Environment: { Variables: { TABLE: 'orders' } },
  })
  const untouched = (s) => {
    expect(updated(s.lambda)).toEqual([])
    expect(s.lambda.state.get('svc-dev-api').Layers).toEqual([
      { Arn: SAME_NAME },
    ])
  }

  test.each(['deploy', 'remove'])(
    'the check before %s leaves it untouched',
    async (verb) => {
      const s = restoreSetup({ live: { 'svc-dev-api': sameNameConfig() } })
      await restoreStageBeforeCommand({ ...s, verb })
      untouched(s)
      expect(s.logger.text()).toBe('')
    },
  )

  test('the check before rollback --timestamp leaves it untouched', async () => {
    const s = restoreSetup({ live: { 'svc-dev-api': sameNameConfig() } })
    s.deps.rollbackTargetExists = async () => true
    await restoreStageBeforeCommand({ ...s, verb: 'rollback', timestamp: '1' })
    untouched(s)
  })

  test('the check before deploy function leaves it untouched', async () => {
    const s = restoreSetup({ live: { 'svc-dev-api': sameNameConfig() } })
    await restoreFunctionBeforeDeployFunction({ ...s, functionKey: 'api' })
    untouched(s)
    expect(s.logger.lines).toEqual([])
  })

  test('dev restore leaves it untouched and has nothing to restore', async () => {
    const s = restoreSetup({ live: { 'svc-dev-api': sameNameConfig() } })
    expect(await runDevRestore(s)).toBe(0)
    untouched(s)
    expect(s.logger.text()).toBe(
      'No function on stage "dev" has Dev Mode configuration.',
    )
  })
})

test('restoring never starts a deployment', async () => {
  const s = restoreSetup({ live: { 'svc-dev-api': attachedConfig() } })
  await runDevRestore(s)
  await restoreStageBeforeCommand({ ...s, verb: 'deploy' })
  await restoreFunctionBeforeDeployFunction({ ...s, functionKey: 'api' })
  expect(s.serverless.pluginManager.spawned).toEqual([])
})

test('deploy restores leftovers first and says so', async () => {
  const s = restoreSetup({ live: { 'svc-dev-api': attachedConfig() } })
  s.deps.progress = recordingProgress(s.logger)
  await restoreStageBeforeCommand({ ...s, verb: 'deploy' })
  // A spinner of its own while it restores, one notice after it: the deploy keeps its outcome line.
  expect(s.logger.lines.filter((line) => line.level !== 'debug')).toEqual([
    {
      level: 'progress',
      namespace: 'dev-restore',
      text: 'Restoring 1 function from Dev Mode',
    },
    {
      level: 'notice',
      text: 'Restored 1 function from Dev Mode (alice@mbp, 10 min ago)',
    },
  ])
  expect(s.deps.progress.removed.get('dev-restore')).toBe(1)
  expect(s.logger.lines).toContainEqual({
    level: 'debug',
    text: 'If a "serverless dev" session is still running on this stage, it no longer has this function: start it again after the deploy.',
  })
  expect(s.lambda.state.get('svc-dev-api').Environment.Variables).toEqual({
    TABLE: 'orders',
  })
  expect(levels(s.logger)).not.toContain('warning')
})

test('deploy prints no restore line when something else restored every function first', async () => {
  const s = restoreSetup({ live: { 'svc-dev-api': attachedConfig() } })
  s.deps.progress = recordingProgress(s.logger)
  // A teammate's restore lands between the check and ours.
  const getFunction = s.lambda.getFunction
  let reads = 0
  s.lambda.getFunction = async (name) => {
    reads += 1
    if (reads > 2) {
      s.lambda.state.set(name, {
        ...s.lambda.state.get(name),
        Layers: [],
        Environment: { Variables: { TABLE: 'orders' } },
      })
    }
    return getFunction(name)
  }
  await restoreStageBeforeCommand({ ...s, verb: 'deploy' })
  expect(
    s.logger.lines.filter(
      (line) => line.level !== 'debug' && line.level !== 'progress',
    ),
  ).toEqual([])
  expect(s.logger.lines).toContainEqual({
    level: 'debug',
    text: 'Restored 0 functions from Dev Mode (alice@mbp, 10 min ago)',
  })
})

test('a stage that was never deployed is checked quietly', async () => {
  const s = restoreSetup()
  s.lambda.state.delete('svc-dev-api')
  s.lambda.state.delete('svc-dev-worker')
  await restoreStageBeforeCommand({ ...s, verb: 'deploy' })
  expect(s.logger.lines).toEqual([])
  expect(reads(s.lambda)).toEqual([
    'getFunction svc-dev-api',
    'getFunction svc-dev-worker',
  ])
})

test("a deploy-only principal never fails the deploy: AccessDenied is a debug line with AWS's message", async () => {
  const s = restoreSetup()
  failingGet(s, deniedGet())
  await expect(
    restoreStageBeforeCommand({ ...s, verb: 'deploy' }),
  ).resolves.toBeUndefined()
  expect(levels(s.logger)).toEqual(['debug'])
  expect(s.logger.text()).toBe(
    'Dev Mode check skipped: it needs lambda:GetFunction (User is not authorized to perform: lambda:GetFunction on resource: svc-dev-api). If a Dev Mode session attached functions of this stage, they stay attached after this deployment; run "serverless dev restore --stage dev --region us-east-1" to detach them.',
  )
})

test("deploy function denied lambda:GetFunction elsewhere: a debug line with AWS's message", async () => {
  const s = restoreSetup({ live: { 'svc-dev-api': attachedConfig() } })
  failingGet(s, deniedGet())
  await restoreFunctionBeforeDeployFunction({ ...s, functionKey: 'api' })
  expect(levels(s.logger)).toEqual(['debug'])
  expect(s.logger.text()).toBe(
    'Dev Mode check skipped: it needs lambda:GetFunction (User is not authorized to perform: lambda:GetFunction on resource: svc-dev-api). If a Dev Mode session attached api, it stays attached after this deployment; run "serverless dev restore --stage dev --region us-east-1 --function api" to detach it.',
  )
})

test('where Dev Mode ran, a check denied lambda:GetFunction is a warning that names the restore', async () => {
  const lines = {}
  for (const verb of ['deploy', 'rollback', 'removal']) {
    const s = restoreSetup({ live: { 'svc-dev-api': attachedConfig() } })
    failingGet(s, deniedGet())
    await expect(
      restoreStageBeforeCommand({ ...s, verb, devModeRanHere: true }),
    ).resolves.toBeUndefined()
    expect(levels(s.logger)).toEqual(['warning'])
    expect(updated(s.lambda)).toEqual([])
    lines[verb] = s.logger.text()
  }
  expect(lines).toEqual({
    deploy:
      'Dev Mode check skipped: it needs lambda:GetFunction. If a Dev Mode session attached functions of this stage, they stay attached after this deployment; run "serverless dev restore --stage dev --region us-east-1" to detach them.',
    rollback:
      'Dev Mode check skipped: it needs lambda:GetFunction. If a Dev Mode session attached functions of this stage, they stay attached after this rollback; run "serverless dev restore --stage dev --region us-east-1" to detach them.',
    removal:
      'Dev Mode check skipped: it needs lambda:GetFunction. If a Dev Mode session attached functions of this stage, this removal deletes them without detaching them first.',
  })
})

test('where Dev Mode ran, deploy function denied lambda:GetFunction warns with the restore of that function', async () => {
  const s = restoreSetup({ live: { 'svc-dev-api': attachedConfig() } })
  failingGet(s, deniedGet())
  await restoreFunctionBeforeDeployFunction({
    ...s,
    functionKey: 'api',
    devModeRanHere: true,
  })
  expect(levels(s.logger)).toEqual(['warning'])
  expect(s.logger.text()).toBe(
    'Dev Mode check skipped: it needs lambda:GetFunction. If a Dev Mode session attached api, it stays attached after this deployment; run "serverless dev restore --stage dev --region us-east-1 --function api" to detach it.',
  )
})

test('one denied read skips the whole check with one debug line, restoring nothing', async () => {
  const s = restoreSetup({
    live: {
      'svc-dev-api': attachedConfig(),
      'svc-dev-worker': attachedConfig(),
    },
  })
  failingGet(s, deniedGet(), ['svc-dev-worker'])
  await expect(
    restoreStageBeforeCommand({ ...s, verb: 'deploy' }),
  ).resolves.toBeUndefined()
  expect(levels(s.logger)).toEqual(['debug'])
  expect(s.logger.text()).toContain('lambda:GetFunction')
  expect(updated(s.lambda)).toEqual([])
  expect(
    s.lambda.state.get('svc-dev-api').Environment.Variables.SLS_DEV_SESSION,
  ).toBe('s_old')
})

test('any other failure of the check is a warning where Dev Mode ran, never an error', async () => {
  const s = restoreSetup()
  failingGet(s, new Error('socket hang up'))
  await expect(
    restoreStageBeforeCommand({ ...s, verb: 'removal', devModeRanHere: true }),
  ).resolves.toBeUndefined()
  expect(levels(s.logger)).toEqual(['warning'])
  expect(s.logger.text()).toBe(
    'Could not check this stage for Dev Mode configuration (socket hang up). If functions still have it, run "serverless dev restore --stage dev --region us-east-1".',
  )
})

test('expired credentials in the check are a warning that names them', async () => {
  const s = restoreSetup()
  failingGet(s, expired())
  await expect(
    restoreStageBeforeCommand({ ...s, verb: 'rollback', devModeRanHere: true }),
  ).resolves.toBeUndefined()
  expect(levels(s.logger)).toEqual(['warning'])
  expect(s.logger.text()).toContain(
    'AWS rejected the credentials (The security token included in the request is expired)',
  )
})

test('a function the check cannot restore is a warning, and the command goes on', async () => {
  const s = restoreSetup({
    live: {
      'svc-dev-api': attachedConfig(),
      'svc-dev-worker': {
        Layers: [{ Arn: DEV_LAYER }],
        Environment: UNREADABLE,
      },
    },
  })
  s.lambda.updateErrors.push(
    Object.assign(new Error('Rate exceeded'), { name: 'ServiceException' }),
  )
  await expect(
    restoreStageBeforeCommand({ ...s, verb: 'removal' }),
  ).resolves.toBeUndefined()
  expect(levels(s.logger)).not.toContain('error')
  const text = s.logger.text()
  expect(text).toContain('Restore incomplete · 0 of 2 functions restored (')
  // Named by their keys, as the rest of the output names functions.
  expect(text).toMatch(/2 functions not restored: .*api \(Rate exceeded\)/)
  expect(text).toMatch(/worker \(.*kms:Decrypt/)
  expect(text).not.toMatch(/svc-dev-api \(/)
  // The restore it suggests retries those two, by their keys.
  expect(text).toMatch(
    /They run the deployed code until restored: run "serverless dev restore --stage dev --region us-east-1 --function (api|worker) --function (api|worker)"\./,
  )
  expect(text).toContain('--function api')
  expect(text).toContain('--function worker')
})

test('a restore before deploy that a function fails names the stage, region and profile in the restore it suggests', async () => {
  const s = restoreSetup({
    stage: 'alice',
    region: 'eu-west-1',
    live: { 'svc-alice-api': attachedConfig() },
  })
  s.provider.options = { 'aws-profile': 'sandbox' }
  s.lambda.updateErrors.push(
    Object.assign(new Error('Rate exceeded'), { name: 'ServiceException' }),
  )
  await restoreStageBeforeCommand({ ...s, verb: 'deploy' })
  expect(s.logger.text()).toContain(
    'It runs the deployed code until restored: run "serverless dev restore --stage alice --region eu-west-1 --aws-profile sandbox --function api".',
  )
  expect(s.logger.text()).not.toContain('run "serverless dev restore".')
})

// A rollback restores only once the deployment it rolls back to is known to exist.
const rollbackSetup = ({ live, exists = true, existsError } = {}) => {
  const s = restoreSetup({ live })
  const checked = []
  s.deps.rollbackTargetExists = async ({ timestamp }) => {
    checked.push(timestamp)
    if (existsError) throw existsError
    return exists
  }
  const run = () =>
    restoreStageBeforeCommand({ ...s, verb: 'rollback', timestamp: '123' })
  return { ...s, checked, run }
}

test('a rollback with nothing in Dev Mode makes no deployment check', async () => {
  const s = rollbackSetup()
  await s.run()
  expect(s.checked).toEqual([])
  expect(s.logger.lines).toEqual([])
})

test('a rollback restores once its deployment is found', async () => {
  const s = rollbackSetup({ live: { 'svc-dev-api': attachedConfig() } })
  await s.run()
  expect(s.checked).toEqual(['123'])
  expect(s.logger.text()).toContain('Restored 1 function from Dev Mode')
  expect(updated(s.lambda)).toEqual(['svc-dev-api'])
})

test('a rollback whose restore fails a function suggests restoring only that function', async () => {
  const s = rollbackSetup({
    live: {
      'svc-dev-api': attachedConfig(),
      'svc-dev-worker': attachedConfig(),
    },
  })
  const update = s.lambda.updateFunctionConfiguration
  s.lambda.updateFunctionConfiguration = async (params) => {
    if (params.FunctionName === 'svc-dev-worker') {
      throw Object.assign(new Error('Rate exceeded'), {
        name: 'ServiceException',
      })
    }
    return update(params)
  }
  await s.run()
  expect(s.logger.text()).toContain(
    'It runs the deployed code until restored: run "serverless dev restore --stage dev --region us-east-1 --function worker".',
  )
})

test('a rollback to a timestamp with no deployment leaves Dev Mode functions alone', async () => {
  const s = rollbackSetup({
    live: { 'svc-dev-api': attachedConfig() },
    exists: false,
  })
  await s.run()
  expect(levels(s.logger)).toEqual(['debug'])
  expect(s.logger.text()).toContain('no deployment for timestamp "123"')
  expect(updated(s.lambda)).toEqual([])
})

test('a deployment check that fails never fails the rollback and restores nothing', async () => {
  const denied = rollbackSetup({
    live: { 'svc-dev-api': attachedConfig() },
    existsError: Object.assign(new Error('Access Denied'), {
      code: 'AWS_S3_LIST_OBJECTS_V2_ACCESS_DENIED',
    }),
  })
  await denied.run()
  expect(levels(denied.logger)).toEqual(['debug'])
  expect(updated(denied.lambda)).toEqual([])

  const broken = rollbackSetup({
    live: { 'svc-dev-api': attachedConfig() },
    existsError: new Error('socket hang up'),
  })
  await broken.run()
  expect(levels(broken.logger)).toEqual(['warning'])
  expect(broken.logger.text()).toBe(
    'Could not check the deployment to roll back to (socket hang up), so Dev Mode configuration was left in place. Run "serverless dev restore --stage dev --region us-east-1" after the rollback.',
  )
  expect(updated(broken.lambda)).toEqual([])
})

test('the deployment check lists the deployment prefix the rollback reads', async () => {
  const directory = `1790000000000-${new Date(1790000000000).toISOString()}`
  const requests = []
  const provider = {
    ...fakeProvider(),
    getDeploymentPrefix: () => 'serverless',
    getServerlessDeploymentBucketName: async () => 'deploy-bucket',
    naming: {
      getCompiledTemplateS3Suffix: () =>
        'compiled-cloudformation-template.json',
    },
    async request(service, method, params) {
      requests.push([service, method, params])
      return {
        Contents: [
          {
            Key: `serverless/svc/dev/${directory}/compiled-cloudformation-template.json`,
          },
        ],
      }
    },
  }
  const serverless = fakeServerless({ functions: { api: {} } })
  expect(
    await rollbackTargetExists({
      serverless,
      provider,
      timestamp: '1790000000000',
    }),
  ).toBe(true)
  expect(
    await rollbackTargetExists({
      serverless,
      provider,
      timestamp: '1700000000000',
    }),
  ).toBe(false)
  expect(requests[0]).toEqual([
    'S3',
    'listObjectsV2',
    { Bucket: 'deploy-bucket', Prefix: 'serverless/svc/dev' },
  ])
})

test('a bug in the check never fails the command', async () => {
  const s = restoreSetup()
  s.serverless.service.getAllFunctions = () => {
    throw new TypeError('boom')
  }
  await expect(
    restoreStageBeforeCommand({ ...s, verb: 'deploy', devModeRanHere: true }),
  ).resolves.toBeUndefined()
  expect(levels(s.logger)).toEqual(['warning'])
  const elsewhere = restoreSetup()
  elsewhere.serverless.service.getAllFunctions = () => {
    throw new TypeError('boom')
  }
  await expect(
    restoreStageBeforeCommand({ ...elsewhere, verb: 'deploy' }),
  ).resolves.toBeUndefined()
  expect(levels(elsewhere.logger)).toEqual(['debug'])
})

test('deploy function restores that one function first', async () => {
  const s = restoreSetup({
    live: {
      'svc-dev-api': attachedConfig(),
      'svc-dev-worker': attachedConfig(),
    },
  })
  await restoreFunctionBeforeDeployFunction({ ...s, functionKey: 'api' })
  expect(s.lambda.state.get('svc-dev-api').Environment.Variables).toEqual({
    TABLE: 'orders',
  })
  expect(updated(s.lambda)).toEqual(['svc-dev-api'])
  expect(s.logger.lines).toEqual([
    { level: 'notice', text: 'Restored api from Dev Mode' },
    {
      level: 'debug',
      text: 'If a "serverless dev" session is still running on this stage, it no longer has this function: start it again after the deploy.',
    },
  ])
  const quiet = restoreSetup()
  await restoreFunctionBeforeDeployFunction({ ...quiet, functionKey: 'api' })
  expect(quiet.logger.lines).toEqual([])
})

test('deploy function shows the notes of the restore', async () => {
  const s = restoreSetup({
    live: {
      // The layer that provided the original wrapper was removed while attached.
      'svc-dev-api': attachedConfig(
        'alice@mbp',
        { AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh' },
        [SDK_LAYER],
      ),
    },
  })
  await restoreFunctionBeforeDeployFunction({ ...s, functionKey: 'api' })
  expect(s.logger.text()).toContain(
    '  api: its exec wrapper /opt/sls-sdk-node/exec-wrapper.sh was not put back',
  )
})

test('deploy function never fails because of the check', async () => {
  const denied = restoreSetup()
  denied.lambda.getFunction = async () => {
    throw Object.assign(new Error('not authorized: lambda:GetFunction'), {
      name: 'AccessDeniedException',
    })
  }
  await restoreFunctionBeforeDeployFunction({ ...denied, functionKey: 'api' })
  expect(levels(denied.logger)).toEqual(['debug'])

  const broken = restoreSetup()
  broken.lambda.getFunction = async () => {
    throw new Error('socket hang up')
  }
  await restoreFunctionBeforeDeployFunction({
    ...broken,
    functionKey: 'api',
    devModeRanHere: true,
  })
  expect(levels(broken.logger)).toEqual(['warning'])
  expect(broken.logger.text()).toContain('socket hang up')

  const unreadable = restoreSetup({
    live: {
      'svc-dev-api': { Layers: [{ Arn: DEV_LAYER }], Environment: UNREADABLE },
    },
  })
  await restoreFunctionBeforeDeployFunction({
    ...unreadable,
    functionKey: 'api',
  })
  expect(levels(unreadable.logger)).toEqual(['warning'])
  expect(unreadable.logger.text()).toContain('kms:Decrypt')
  expect(unreadable.logger.text()).toContain(
    'Run "serverless dev restore --stage dev --region us-east-1 --function api"',
  )
})

test('deploy function of a function that is not in serverless.yml is left to deploy function', async () => {
  const s = restoreSetup()
  await restoreFunctionBeforeDeployFunction({ ...s, functionKey: 'nope' })
  expect(s.logger.lines).toEqual([])
  expect(s.lambda.calls).toEqual([])
})

test('restore-first hooks are registered only for the exact commands', () => {
  const handlers = {
    setup: async () => 'setup',
    restore: async () => 'restore',
    restoreStage: (verb) => async () => verb,
    restoreFunction: async () => 'function',
  }
  const hooksOf = (commandName) =>
    devModeCommandHooks({ commandName, options: {}, handlers })
  expect(Object.keys(hooksOf('deploy')).sort()).toEqual([
    'before:deploy:deploy',
    'dev:restore:restore',
    'dev:setup:setup',
  ])
  expect(Object.keys(hooksOf('remove'))).toContain('before:remove:remove')
  expect(Object.keys(hooksOf('rollback'))).toContain('before:rollback:rollback')
  expect(Object.keys(hooksOf('rollback'))).not.toContain(
    'before:rollback:initialize',
  )
  expect(Object.keys(hooksOf('deploy function'))).toContain(
    'before:deploy:function:initialize',
  )
  for (const commandName of [
    'dev',
    'dev restore',
    'deploy list',
    'rollback function',
    'package',
    'info',
  ]) {
    expect(Object.keys(hooksOf(commandName)).sort()).toEqual([
      'dev:restore:restore',
      'dev:setup:setup',
    ])
  }
})

test('each restore-first hook passes the verb its line uses', async () => {
  const handlers = {
    setup: async () => {},
    restore: async () => {},
    restoreStage: (verb) => async () => verb,
    restoreFunction: async () => 'function',
  }
  const hook = (commandName, name, options = {}) =>
    devModeCommandHooks({ commandName, options, handlers })[name]()
  expect(await hook('deploy', 'before:deploy:deploy')).toBe('deploy')
  expect(await hook('remove', 'before:remove:remove')).toBe('removal')
  expect(
    await hook('rollback', 'before:rollback:rollback', { timestamp: '1' }),
  ).toBe('rollback')
})

test('a rollback that only lists deployments restores nothing', async () => {
  let restored = 0
  const options = {}
  const hooks = devModeCommandHooks({
    commandName: 'rollback',
    options,
    handlers: {
      setup: async () => {},
      restore: async () => {},
      restoreStage: () => async () => {
        restored += 1
      },
      restoreFunction: async () => {},
    },
  })
  await hooks['before:rollback:rollback']()
  expect(restored).toBe(0)
  // -t is turned into --timestamp after the plugins are built: the hook reads it when it runs.
  options.timestamp = '1790000000000'
  await hooks['before:rollback:rollback']()
  expect(restored).toBe(1)
})

test('the finite commands get their hooks from the handlers given', () => {
  const handlers = {
    setup: async () => {},
    restore: async () => {},
    status: async () => {},
    stop: async () => {},
    wait: async () => {},
    requests: async () => {},
    replay: async () => {},
    restoreStage: () => async () => {},
    restoreFunction: async () => {},
  }
  const hooks = devModeCommandHooks({
    commandName: 'dev wait',
    options: {},
    handlers,
  })
  expect(hooks['dev:status:status']).toBe(handlers.status)
  expect(hooks['dev:stop:stop']).toBe(handlers.stop)
  expect(hooks['dev:wait:wait']).toBe(handlers.wait)
  expect(hooks['dev:requests:requests']).toBe(handlers.requests)
  expect(hooks['dev:replay:replay']).toBe(handlers.replay)
})
