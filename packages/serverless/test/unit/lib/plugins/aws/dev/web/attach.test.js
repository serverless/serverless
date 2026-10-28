import {
  attachWebApp,
  deleteCreated,
  findAttachedWebApps,
  mainRevisionOf,
  restoreWebApp,
  sessionResourceCounts,
} from '../../../../../../../lib/plugins/aws/dev/web/attach.js'
import {
  FALLBACK_ENDPOINT,
  LOCAL_ENDPOINT,
  WEB_BRIDGE_ENTRY,
} from '../../../../../../../lib/plugins/aws/dev/attach/naming.js'
import { fakeLambdaWeb, testSessionId } from '../attach/fakes.js'

const FN = 'svc-dev-api'
const ROLE = 'arn:aws:iam::123456789012:role/svc-dev-us-east-1-lambdaRole'
const KMS = 'arn:aws:kms:us-east-1:123456789012:key/k1'
const CONNECTOR = 'arn:aws:lambda:us-east-1:123456789012:network-connector/c1:1'
const SESSION = testSessionId(1)

const session = (over = {}) => ({
  id: SESSION,
  owner: 'ada@laptop',
  attachedAt: 1_700_000_000_000,
  broker: {
    arn: 'arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1',
    externalId: 'external-id',
  },
  key: 'c2Vzc2lvbi1rZXk=',
  iotEndpoint: 'abc-ats.iot.us-east-1.amazonaws.com',
  ...over,
})

const deployedRevision = (over = {}) => ({
  kmsKeyArn: KMS,
  buildConfig: {
    codeConfig: { s3Object: { bucket: 'deploy-bucket', key: 'web/api.zip' } },
    runtimeConfig: { runtime: 'nodejs24.x' },
  },
  serviceConfig: {
    executionRoleArn: ROLE,
    timeoutSeconds: 20,
    maxConcurrencyPerEnvironment: 8,
    egressNetworkConnectorArn: CONNECTOR,
    environmentVariables: {
      AWS_LAMBDA_NODEJS_ENTRYPOINT: 'server.js',
      TABLE: 'orders',
    },
    telemetryConfig: { loggingConfig: { applicationLogLevel: 'WARN' } },
  },
  ...over,
})

const deployedStage = (main = [{ revisionId: 'rev-cfn', weight: 100 }]) =>
  fakeLambdaWeb({
    [FN]: {
      revisions: { 'rev-cfn': deployedRevision() },
      endpoints: {
        main: { authType: 'ApplicationManaged', revisionWeights: main },
      },
    },
  })

const clock = () => {
  let t = 0
  const waits = []
  return {
    waits,
    now: () => t,
    sleep: async (ms) => {
      waits.push(ms)
      t += ms
    },
  }
}

const bridge = {
  bucket: 'deploy-bucket',
  key: 'serverless-dev-mode/bridge.zip',
}

const attach = (lambdaWeb, over = {}) =>
  attachWebApp({
    lambdaWeb,
    functionName: FN,
    mainRevisionId: 'rev-cfn',
    bridge,
    session: session(),
    ...over,
  })

const web = (lambdaWeb) => lambdaWeb.state.get(FN)
const mainWeights = (lambdaWeb) =>
  web(lambdaWeb).endpoints.get('main').revisionWeights
const revisionIds = (lambdaWeb) => [...web(lambdaWeb).revisions.keys()]
const endpointNames = (lambdaWeb) => [...web(lambdaWeb).endpoints.keys()]
const writes = (lambdaWeb) =>
  lambdaWeb.calls.filter(([method]) => /^(create|delete|update)/.test(method))

describe('attachWebApp', () => {
  test('attach creates the clone, then the fallback on the clone, then the dev revision with FALLBACK_URL, then moves main', async () => {
    const lambdaWeb = deployedStage()
    const created = []
    const result = await attach(lambdaWeb, {
      onCreated: (resource) => created.push(resource),
    })

    expect(lambdaWeb.calls.map(([method]) => method)).toEqual([
      'getEndpoint',
      'getRevision',
      'createRevision',
      'waitRevisionActive',
      'createEndpoint',
      'waitEndpointActive',
      'createRevision',
      'waitRevisionActive',
      'updateEndpointWeights',
    ])
    const [clone, dev] = lambdaWeb.calls
      .filter(([method]) => method === 'createRevision')
      .map(([, input]) => input)
    // The clone is the deployed revision, marked as Dev Mode's.
    expect(clone).toEqual({
      functionName: FN,
      description: `Serverless Dev Mode clone for session ${SESSION}`,
      ...deployedRevision(),
      serviceConfig: {
        ...deployedRevision().serviceConfig,
        environmentVariables: {
          AWS_LAMBDA_NODEJS_ENTRYPOINT: 'server.js',
          TABLE: 'orders',
          SLS_DEV_REVISION_ROLE: 'clone',
        },
      },
    })
    const fallbackCreate = lambdaWeb.calls.find(
      ([method]) => method === 'createEndpoint',
    )[1]
    expect(fallbackCreate).toEqual({
      functionName: FN,
      endpointName: FALLBACK_ENDPOINT,
      revisionId: result.cloneRevisionId,
      // `main`'s: the app gets its requests, Authorization included, as `main` gives them.
      authType: 'ApplicationManaged',
    })
    expect(dev.description).toBe(
      `Serverless Dev Mode dev for session ${SESSION}`,
    )
    expect(dev.serviceConfig.environmentVariables.SLS_DEV_FALLBACK_URL).toBe(
      `https://${FALLBACK_ENDPOINT}-${FN}.web.test`,
    )
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: result.devRevisionId, weight: 100 },
    ])
    expect(result).toEqual({
      devRevisionId: 'rev-new2',
      cloneRevisionId: 'rev-new1',
      deployedRuntime: 'nodejs24.x',
      deployedTimeoutSeconds: 20,
      endpoints: [FALLBACK_ENDPOINT],
      restoreRevisionId: 'rev-cfn',
      deployedVariables: {
        AWS_LAMBDA_NODEJS_ENTRYPOINT: 'server.js',
        TABLE: 'orders',
      },
      // The real URL, as main gives it.
      url: `https://main-${FN}.web.test`,
    })
    // Every create is announced as soon as it returns, before its wait.
    expect(created).toEqual([
      {
        type: 'revision',
        functionName: FN,
        revisionId: 'rev-new1',
        role: 'clone',
      },
      { type: 'endpoint', functionName: FN, endpointName: FALLBACK_ENDPOINT },
      {
        type: 'revision',
        functionName: FN,
        revisionId: 'rev-new2',
        role: 'dev',
      },
      {
        type: 'traffic',
        functionName: FN,
        endpointName: 'main',
        revisionId: 'rev-new2',
        restoreRevisionId: 'rev-cfn',
      },
    ])
  })

  test('local-only creates sls-dev-local on the dev revision and leaves main', async () => {
    const lambdaWeb = deployedStage()
    const created = []
    const result = await attach(lambdaWeb, {
      localOnly: true,
      onCreated: (resource) => created.push(resource),
    })

    expect(writes(lambdaWeb).map(([method]) => method)).toEqual([
      'createRevision',
      'createEndpoint',
    ])
    expect(result).toEqual({
      devRevisionId: 'rev-new1',
      cloneRevisionId: undefined,
      deployedRuntime: 'nodejs24.x',
      deployedTimeoutSeconds: 20,
      endpoints: [LOCAL_ENDPOINT],
      restoreRevisionId: 'rev-cfn',
      deployedVariables: {
        AWS_LAMBDA_NODEJS_ENTRYPOINT: 'server.js',
        TABLE: 'orders',
      },
      localUrl: `https://${LOCAL_ENDPOINT}-${FN}.web.test`,
    })
    expect(web(lambdaWeb).endpoints.get(LOCAL_ENDPOINT)).toMatchObject({
      authType: 'IamAuth',
      revisionWeights: [{ revisionId: 'rev-new1', weight: 100 }],
    })
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn', weight: 100 },
    ])
    const variables =
      web(lambdaWeb).revisions.get('rev-new1').serviceConfig
        .environmentVariables
    expect(variables).not.toHaveProperty('SLS_DEV_FALLBACK_URL')
    expect(variables).not.toHaveProperty('SLS_DEV_FALLBACK_AUTH')
    expect(variables.SLS_DEV_WEB_FUNCTION).toBe(FN)
    expect(variables.SLS_DEV_REVISION_ROLE).toBe('dev')
    expect(created.map(({ type }) => type)).toEqual(['revision', 'endpoint'])
  })

  test('dev revision environment carries RESTORE_REVISION and the deployed variables', async () => {
    const lambdaWeb = deployedStage()
    const { devRevisionId } = await attach(lambdaWeb)
    const dev = web(lambdaWeb).revisions.get(devRevisionId)

    expect(dev.kmsKeyArn).toBe(KMS)
    expect(dev.buildConfig).toEqual({
      codeConfig: { s3Object: bridge },
      runtimeConfig: { runtime: 'nodejs24.x' },
    })
    expect(dev.serviceConfig).toEqual({
      executionRoleArn: ROLE,
      timeoutSeconds: 20,
      maxConcurrencyPerEnvironment: 8,
      egressNetworkConnectorArn: CONNECTOR,
      telemetryConfig: { loggingConfig: { applicationLogLevel: 'WARN' } },
      environmentVariables: {
        TABLE: 'orders',
        AWS_LAMBDA_NODEJS_ENTRYPOINT: WEB_BRIDGE_ENTRY,
        SLS_DEV_VERSION: '1',
        SLS_DEV_SESSION: SESSION,
        SLS_DEV_OWNER: 'ada@laptop',
        SLS_DEV_ATTACHED_AT: '1700000000000',
        SLS_DEV_BROKER_ROLE_ARN:
          'arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1',
        SLS_DEV_BROKER_EXTERNAL_ID: 'external-id',
        SLS_DEV_SESSION_KEY: 'c2Vzc2lvbi1rZXk=',
        SLS_DEV_IOT_ENDPOINT: 'abc-ats.iot.us-east-1.amazonaws.com',
        SLS_DEV_RESTORE_REVISION: 'rev-cfn',
        SLS_DEV_REVISION_ROLE: 'dev',
        SLS_DEV_WEB_FUNCTION: FN,
        SLS_DEV_FALLBACK_URL: `https://${FALLBACK_ENDPOINT}-${FN}.web.test`,
        SLS_DEV_FALLBACK_AUTH: 'ApplicationManaged',
      },
    })
  })

  test('the fallback copies the auth type of an IAM-auth main, and the dev revision says so', async () => {
    const lambdaWeb = fakeLambdaWeb({
      [FN]: {
        revisions: { 'rev-cfn': deployedRevision() },
        endpoints: {
          main: {
            authType: 'IamAuth',
            revisionWeights: [{ revisionId: 'rev-cfn', weight: 100 }],
          },
        },
      },
    })
    const result = await attach(lambdaWeb)
    expect(web(lambdaWeb).endpoints.get(FALLBACK_ENDPOINT).authType).toBe(
      'IamAuth',
    )
    const variables = web(lambdaWeb).revisions.get(result.devRevisionId)
      .serviceConfig.environmentVariables
    expect(variables.SLS_DEV_FALLBACK_AUTH).toBe('IamAuth')
    expect(variables.SLS_DEV_WEB_FUNCTION).toBe(FN)
  })

  test('with two weights on main, the heaviest revision is cloned and restored to', async () => {
    const lambdaWeb = fakeLambdaWeb({
      [FN]: {
        revisions: {
          'rev-old': deployedRevision(),
          'rev-cfn': deployedRevision(),
        },
        endpoints: {
          main: {
            revisionWeights: [
              { revisionId: 'rev-old', weight: 10 },
              { revisionId: 'rev-cfn', weight: 90 },
            ],
          },
        },
      },
    })
    expect(mainRevisionOf(web(lambdaWeb).endpoints.get('main'))).toBe('rev-cfn')
    const { devRevisionId } = await attach(lambdaWeb, {
      mainRevisionId: undefined,
    })
    expect(lambdaWeb.calls[0]).toEqual([
      'getEndpoint',
      { functionName: FN, endpointName: 'main' },
    ])
    expect(
      web(lambdaWeb).revisions.get(devRevisionId).serviceConfig
        .environmentVariables.SLS_DEV_RESTORE_REVISION,
    ).toBe('rev-cfn')
    await restoreWebApp({ lambdaWeb, functionName: FN })
    // The canary's second weight is not put back: main serves the heaviest revision alone.
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn', weight: 100 },
    ])
  })

  test('a main that serves a Dev Mode revision is refused: restore first', async () => {
    const lambdaWeb = deployedStage()
    const { devRevisionId } = await attach(lambdaWeb)
    await expect(
      attach(lambdaWeb, { mainRevisionId: devRevisionId }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_WEB_APP_STILL_ATTACHED' })
  })

  test('a deployed revision that is gone is a clear error', async () => {
    const lambdaWeb = deployedStage()
    await expect(
      attach(lambdaWeb, { mainRevisionId: 'rev-missing' }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_WEB_REVISION_NOT_FOUND' })
    expect(writes(lambdaWeb)).toEqual([])
  })

  test('a dev revision environment over 32,768 bytes is refused before AWS is asked', async () => {
    const big = 'x'.repeat(32_400)
    const lambdaWeb = fakeLambdaWeb({
      [FN]: {
        revisions: {
          'rev-cfn': deployedRevision({
            serviceConfig: {
              executionRoleArn: ROLE,
              environmentVariables: { BIG: big },
            },
          }),
        },
        endpoints: {
          main: { revisionWeights: [{ revisionId: 'rev-cfn', weight: 100 }] },
        },
      },
    })
    const error = await attach(lambdaWeb, { webApp: 'api' }).catch(
      (caught) => caught,
    )
    expect(error.code).toBe('DEV_MODE_WEB_APP_ENVIRONMENT_TOO_LARGE')
    const size = Buffer.byteLength(
      JSON.stringify({
        BIG: big,
        AWS_LAMBDA_NODEJS_ENTRYPOINT: WEB_BRIDGE_ENTRY,
      }),
    )
    expect(error.message).toMatch(
      /^The environment variables of the web app api would take \d+ bytes in Dev Mode, over the AWS Lambda limit of 32768 bytes: Dev Mode adds \d+ bytes to the deployed ones\./,
    )
    const [, total, added] = /take (\d+) bytes.*adds (\d+) bytes/.exec(
      error.message,
    )
    expect(Number(total)).toBeGreaterThan(32_768)
    expect(Number(total) - Number(added)).toBe(
      Buffer.byteLength(JSON.stringify({ BIG: big })),
    )
    expect(Number(total)).toBeGreaterThan(size)
    expect(error.message).not.toContain('c2Vzc2lvbi1rZXk=')
    // The clone fits; only the dev revision was refused, before its create.
    expect(
      lambdaWeb.calls.filter(([method]) => method === 'createRevision'),
    ).toHaveLength(1)
  })

  test("AWS's own environment size refusal becomes the same error", async () => {
    const lambdaWeb = deployedStage()
    lambdaWeb.failures.createRevision = [
      undefined,
      Object.assign(
        new Error(
          'The environmentVariables cannot exceed 32768 bytes. The current size is 33001 bytes.',
        ),
        { name: 'ValidationException' },
      ),
    ]
    const error = await attach(lambdaWeb).catch((caught) => caught)
    expect(error.code).toBe('DEV_MODE_WEB_APP_ENVIRONMENT_TOO_LARGE')
    expect(error.message).toContain(`web app ${FN} would take 33001 bytes`)
    // Any other validation error is passed on as it is.
    const other = deployedStage()
    other.failures.createRevision = [
      Object.assign(new Error('timeoutSeconds is invalid'), {
        name: 'ValidationException',
      }),
    ]
    await expect(attach(other)).rejects.toThrow('timeoutSeconds is invalid')
  })
})

describe('restoreWebApp', () => {
  test('restore moves main back and deletes endpoints then revisions', async () => {
    const lambdaWeb = deployedStage()
    await attach(lambdaWeb)
    lambdaWeb.calls.length = 0

    expect(await restoreWebApp({ lambdaWeb, functionName: FN })).toEqual({
      state: 'restored',
    })
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn', weight: 100 },
    ])
    expect(endpointNames(lambdaWeb)).toEqual(['main'])
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn'])
    expect(writes(lambdaWeb)).toEqual([
      [
        'updateEndpointWeights',
        { functionName: FN, endpointName: 'main', revisionId: 'rev-cfn' },
      ],
      ['deleteEndpoint', { functionName: FN, endpointName: FALLBACK_ENDPOINT }],
      ['deleteEndpoint', { functionName: FN, endpointName: LOCAL_ENDPOINT }],
      ['deleteRevision', { functionName: FN, revisionId: 'rev-new1' }],
      ['deleteRevision', { functionName: FN, revisionId: 'rev-new2' }],
    ])
  })

  test('restore when main was already moved by a deploy deletes only Dev Mode resources', async () => {
    const lambdaWeb = deployedStage()
    await attach(lambdaWeb)
    // A deploy replaced the revision and pointed main at it.
    web(lambdaWeb).revisions.set('rev-cfn2', {
      revisionId: 'rev-cfn2',
      state: 'Active',
      ...deployedRevision(),
    })
    web(lambdaWeb).endpoints.get('main').revisionWeights = [
      { revisionId: 'rev-cfn2', weight: 100 },
    ]
    lambdaWeb.calls.length = 0

    expect(await restoreWebApp({ lambdaWeb, functionName: FN })).toEqual({
      state: 'restored',
    })
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn2', weight: 100 },
    ])
    expect(
      writes(lambdaWeb).some(([method]) => method === 'updateEndpointWeights'),
    ).toBe(false)
    expect(endpointNames(lambdaWeb)).toEqual(['main'])
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn', 'rev-cfn2'])
  })

  test('restore is idempotent', async () => {
    const lambdaWeb = deployedStage()
    await attach(lambdaWeb)
    await restoreWebApp({ lambdaWeb, functionName: FN })
    lambdaWeb.calls.length = 0

    expect(await restoreWebApp({ lambdaWeb, functionName: FN })).toEqual({
      state: 'unchanged',
    })
    expect(
      writes(lambdaWeb).filter(([method]) => method !== 'deleteEndpoint'),
    ).toEqual([])
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn', weight: 100 },
    ])
    // A web function that is gone has nothing to restore.
    expect(
      await restoreWebApp({ lambdaWeb, functionName: 'svc-dev-gone' }),
    ).toEqual({ state: 'unchanged' })
  })

  test('only revisions that carry SLS_DEV_REVISION_ROLE are read and deleted', async () => {
    const lambdaWeb = deployedStage()
    await attach(lambdaWeb)
    // A revision someone described like Dev Mode's, without its variables, is not Dev Mode's.
    web(lambdaWeb).revisions.set('rev-lookalike', {
      revisionId: 'rev-lookalike',
      description: 'Serverless Dev Mode dev for session s_x',
      state: 'Active',
      ...deployedRevision(),
    })
    web(lambdaWeb).revisions.set('rev-described', {
      revisionId: 'rev-described',
      description: 'release 42',
      state: 'Active',
      ...deployedRevision(),
    })
    lambdaWeb.calls.length = 0
    await restoreWebApp({ lambdaWeb, functionName: FN })
    expect(revisionIds(lambdaWeb)).toEqual([
      'rev-cfn',
      'rev-lookalike',
      'rev-described',
    ])
    expect(
      lambdaWeb.calls
        .filter(([method]) => method === 'getRevision')
        .map(([, { revisionId }]) => revisionId)
        .sort(),
    ).toEqual(['rev-lookalike', 'rev-new1', 'rev-new2'])
  })

  test("with a session id, another session's web app is left as it is", async () => {
    const lambdaWeb = deployedStage()
    await attach(lambdaWeb)
    lambdaWeb.calls.length = 0
    expect(
      await restoreWebApp({
        lambdaWeb,
        functionName: FN,
        sessionId: testSessionId(2),
      }),
    ).toEqual({ state: 'unchanged' })
    expect(writes(lambdaWeb)).toEqual([])
    expect(revisionIds(lambdaWeb)).toHaveLength(3)
    expect(
      await restoreWebApp({ lambdaWeb, functionName: FN, sessionId: SESSION }),
    ).toEqual({ state: 'restored' })
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn'])
  })

  test('a revision still held by an endpoint being deleted is deleted once it is free', async () => {
    const lambdaWeb = deployedStage()
    await attach(lambdaWeb)
    lambdaWeb.failures.deleteRevision = [
      Object.assign(
        new Error('the endpoints [sls-dev-fallback] are using it'),
        {
          name: 'ConflictException',
        },
      ),
    ]
    const waits = []
    expect(
      await restoreWebApp({
        lambdaWeb,
        functionName: FN,
        sleep: async (ms) => waits.push(ms),
      }),
    ).toEqual({ state: 'restored' })
    expect(waits).toEqual([500])
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn'])
  })

  test('a dev revision main has just left is deleted once main lets go of it', async () => {
    const lambdaWeb = deployedStage()
    await attach(lambdaWeb)
    // Moving main's weights takes about a second to land: until then, deleting the revision it
    // left answers 409 naming main, although main already lists only the deployed revision.
    const heldByMain = () =>
      Object.assign(
        new Error(
          'The revision rev-x cannot be deleted because the endpoints [main] are using it. Update the endpoints to use other revisions first.',
        ),
        { name: 'ConflictException' },
      )
    lambdaWeb.failures.deleteRevision = [heldByMain(), heldByMain()]
    const waits = []
    expect(
      await restoreWebApp({
        lambdaWeb,
        functionName: FN,
        sessionId: SESSION,
        sleep: async (ms) => waits.push(ms),
      }),
    ).toEqual({ state: 'restored' })
    expect(waits).toEqual([500, 500])
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn', weight: 100 },
    ])
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn'])
  })

  test('with a session id, a Dev Mode endpoint without weights is skipped', async () => {
    const lambdaWeb = deployedStage()
    await attach(lambdaWeb, { localOnly: true })
    web(lambdaWeb).endpoints.get(LOCAL_ENDPOINT).revisionWeights = []
    lambdaWeb.calls.length = 0
    expect(
      await restoreWebApp({ lambdaWeb, functionName: FN, sessionId: SESSION }),
    ).toEqual({ state: 'restored' })
    // The endpoint tells no session, so it stays; the session's dev revision goes.
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn'])
    expect(
      lambdaWeb.calls.filter(
        ([method, input]) => method === 'getRevision' && !input.revisionId,
      ),
    ).toEqual([])
    expect(endpointNames(lambdaWeb)).toContain(LOCAL_ENDPOINT)
  })

  test('main moved to a clone by hand: failed, with how to fix it', async () => {
    const lambdaWeb = deployedStage()
    const { cloneRevisionId } = await attach(lambdaWeb)
    web(lambdaWeb).endpoints.get('main').revisionWeights = [
      { revisionId: cloneRevisionId, weight: 100 },
    ]
    const outcome = await restoreWebApp({ lambdaWeb, functionName: FN })
    expect(outcome.state).toBe('failed')
    expect(outcome.message).toContain('Dev Mode clone')
    expect(outcome.message).toContain('serverless deploy')
  })

  test('a deployed revision that is gone leaves main and reports failed', async () => {
    const lambdaWeb = deployedStage()
    const { devRevisionId } = await attach(lambdaWeb)
    web(lambdaWeb).revisions.delete('rev-cfn')
    const outcome = await restoreWebApp({ lambdaWeb, functionName: FN })
    expect(outcome.state).toBe('failed')
    expect(outcome.message).toMatch(
      /^The revision rev-cfn that the endpoint main .* no longer exists/,
    )
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: devRevisionId, weight: 100 },
    ])
  })
})

describe('interrupted attach (Ctrl+C)', () => {
  test('interrupted after clone, before endpoint: restore with onCreated list deletes the clone and leaves main', async () => {
    const lambdaWeb = deployedStage()
    const controller = new AbortController()
    const created = []
    const attaching = attach(lambdaWeb, {
      signal: controller.signal,
      onCreated: (resource) => {
        created.push(resource)
        // Ctrl+C right after the clone was created.
        if (resource.role === 'clone') controller.abort()
      },
    })
    await expect(attaching).rejects.toMatchObject({ name: 'AbortError' })
    expect(created).toEqual([
      {
        type: 'revision',
        functionName: FN,
        revisionId: 'rev-new1',
        role: 'clone',
      },
    ])
    expect(
      lambdaWeb.calls.some(([method]) => method === 'createEndpoint'),
    ).toBe(false)

    await deleteCreated({ lambdaWeb, created })
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn'])
    expect(endpointNames(lambdaWeb)).toEqual(['main'])
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn', weight: 100 },
    ])
    expect(
      lambdaWeb.calls.some(([method]) => method === 'updateEndpointWeights'),
    ).toBe(false)
    // Again, as a second Ctrl+C would: nothing left to do.
    await deleteCreated({ lambdaWeb, created })
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn'])
  })

  test('a create that landed but has not answered: abort, await the attach, clean up once, without stalling', async () => {
    const lambdaWeb = deployedStage()
    // AWS deletes endpoints asynchronously: their revisions stay held for a moment.
    lambdaWeb.heldAfterDelete = 2
    const c = clock()
    const controller = new AbortController()
    const created = []
    const gate = lambdaWeb.gate('createEndpoint', { applied: true })
    const attaching = attach(lambdaWeb, {
      signal: controller.signal,
      onCreated: (resource) => created.push(resource),
    })
    const settled = attaching.catch((error) => error)
    await gate.reached
    // The fallback exists in AWS; the attach has not heard back. Ctrl+C:
    expect(endpointNames(lambdaWeb)).toContain(FALLBACK_ENDPOINT)
    controller.abort()
    gate.release()
    expect(await settled).toMatchObject({ name: 'AbortError' })
    const outcome = await deleteCreated({
      lambdaWeb,
      created,
      sleep: c.sleep,
      now: c.now,
    })
    expect(outcome).toEqual({ failures: [] })
    expect(c.now()).toBeLessThanOrEqual(2_000)
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn'])
    expect(endpointNames(lambdaWeb)).toEqual(['main'])
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn', weight: 100 },
    ])
  })

  test('a clean-up run before an in-flight create answered reports the held revision at once', async () => {
    const lambdaWeb = deployedStage()
    const c = clock()
    const created = []
    const gate = lambdaWeb.gate('createEndpoint', { applied: true })
    const attaching = attach(lambdaWeb, {
      onCreated: (resource) => created.push(resource),
    })
    await gate.reached
    // Run too early: the list does not have the fallback yet, which still serves the clone.
    const outcome = await deleteCreated({
      lambdaWeb,
      created,
      sleep: c.sleep,
      now: c.now,
    })
    expect(c.waits).toEqual([])
    expect(outcome.failures).toEqual([
      {
        resource: expect.objectContaining({ revisionId: 'rev-new1' }),
        message: expect.stringContaining('[sls-dev-fallback]'),
      },
    ])
    gate.release()
    await attaching
    expect((await deleteCreated({ lambdaWeb, created })).failures).toEqual([])
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn'])
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn', weight: 100 },
    ])
  })

  test('revision deletes: a 409 that does not clear gives up after 5 s, one naming a main that serves the revision stops at once, others are recorded', async () => {
    const conflict = (names) =>
      Object.assign(
        new Error(
          `The revision rev-new1 cannot be deleted because the endpoints [${names}] are using it. Update the endpoints to use other revisions first.`,
        ),
        { name: 'ConflictException' },
      )
    const created = [
      {
        type: 'revision',
        functionName: FN,
        revisionId: 'rev-new1',
        role: 'clone',
      },
    ]
    const withClone = () => {
      const lambdaWeb = deployedStage()
      web(lambdaWeb).revisions.set('rev-new1', {
        revisionId: 'rev-new1',
        state: 'Active',
        ...deployedRevision(),
      })
      return lambdaWeb
    }

    // A deleted endpoint that keeps holding it: tried every 500 ms for 5 s.
    let lambdaWeb = withClone()
    lambdaWeb.failures.deleteRevision = Array.from({ length: 20 }, () =>
      conflict('sls-dev-fallback'),
    )
    let c = clock()
    let outcome = await deleteCreated({
      lambdaWeb,
      created,
      sleep: c.sleep,
      now: c.now,
    })
    expect(outcome.failures).toHaveLength(1)
    expect(c.waits.every((ms) => ms === 500)).toBe(true)
    expect(c.now()).toBeGreaterThanOrEqual(5_000)
    expect(c.now()).toBeLessThanOrEqual(5_500)

    // main serves it: no retry.
    lambdaWeb = withClone()
    web(lambdaWeb).endpoints.get('main').revisionWeights = [
      { revisionId: 'rev-new1', weight: 100 },
    ]
    lambdaWeb.failures.deleteRevision = [conflict('main')]
    c = clock()
    outcome = await deleteCreated({
      lambdaWeb,
      created,
      sleep: c.sleep,
      now: c.now,
    })
    expect(c.waits).toEqual([])
    expect(outcome.failures[0].message).toContain('[main]')

    // Any other error: recorded, not thrown, and nothing waited for.
    lambdaWeb = withClone()
    lambdaWeb.failures.deleteRevision = [
      Object.assign(new Error('Rate exceeded'), { name: 'ServiceException' }),
    ]
    c = clock()
    outcome = await deleteCreated({
      lambdaWeb,
      created,
      sleep: c.sleep,
      now: c.now,
    })
    expect(outcome.failures).toEqual([
      { resource: created[0], message: 'Rate exceeded' },
    ])
    expect(c.waits).toEqual([])
  })

  test('deleteCreated after a full attach moves main back first', async () => {
    const lambdaWeb = deployedStage()
    const created = []
    await attach(lambdaWeb, { onCreated: (resource) => created.push(resource) })
    await deleteCreated({ lambdaWeb, created })
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn', weight: 100 },
    ])
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn'])
    expect(endpointNames(lambdaWeb)).toEqual(['main'])
  })

  test('deleteCreated leaves an endpoint that another session took over', async () => {
    const lambdaWeb = deployedStage()
    const created = []
    await attach(lambdaWeb, { onCreated: (resource) => created.push(resource) })
    // Another session took the web app over: the endpoint now serves its own revision.
    web(lambdaWeb).revisions.set('rev-other', {
      revisionId: 'rev-other',
      state: 'Active',
      ...deployedRevision(),
    })
    web(lambdaWeb).endpoints.get(FALLBACK_ENDPOINT).revisionWeights = [
      { revisionId: 'rev-other', weight: 100 },
    ]
    web(lambdaWeb).endpoints.get('main').revisionWeights = [
      { revisionId: 'rev-other', weight: 100 },
    ]
    expect((await deleteCreated({ lambdaWeb, created })).failures).toEqual([])
    expect(endpointNames(lambdaWeb)).toEqual(['main', FALLBACK_ENDPOINT])
    expect(
      web(lambdaWeb).endpoints.get(FALLBACK_ENDPOINT).revisionWeights,
    ).toEqual([{ revisionId: 'rev-other', weight: 100 }])
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn', 'rev-other'])
  })

  test('deleteCreated leaves main alone when a deploy moved it meanwhile', async () => {
    const lambdaWeb = deployedStage()
    const created = []
    await attach(lambdaWeb, { onCreated: (resource) => created.push(resource) })
    web(lambdaWeb).revisions.set('rev-cfn2', {
      revisionId: 'rev-cfn2',
      state: 'Active',
      ...deployedRevision(),
    })
    web(lambdaWeb).endpoints.get('main').revisionWeights = [
      { revisionId: 'rev-cfn2', weight: 100 },
    ]
    await deleteCreated({ lambdaWeb, created })
    expect(mainWeights(lambdaWeb)).toEqual([
      { revisionId: 'rev-cfn2', weight: 100 },
    ])
    expect(revisionIds(lambdaWeb)).toEqual(['rev-cfn', 'rev-cfn2'])
  })
})

describe('findAttachedWebApps', () => {
  test('finds a web app whose main serves a dev revision, and a local-only one', async () => {
    const relayed = deployedStage()
    await attach(relayed)
    const local = fakeLambdaWeb({
      'svc-dev-site': {
        revisions: { 'rev-cfn': deployedRevision() },
        endpoints: {
          main: { revisionWeights: [{ revisionId: 'rev-cfn', weight: 100 }] },
        },
      },
      'svc-dev-plain': {
        revisions: { 'rev-cfn': deployedRevision() },
        endpoints: {
          main: { revisionWeights: [{ revisionId: 'rev-cfn', weight: 100 }] },
        },
      },
    })
    await attachWebApp({
      lambdaWeb: local,
      functionName: 'svc-dev-site',
      mainRevisionId: 'rev-cfn',
      bridge,
      session: session({ id: testSessionId(3), owner: 'bob@desk' }),
      localOnly: true,
    })
    // One client over all three web functions.
    for (const [name, value] of local.state) relayed.state.set(name, value)

    expect(
      await findAttachedWebApps({
        lambdaWeb: relayed,
        webApps: [
          { key: 'api', functionName: FN },
          { key: 'site', functionName: 'svc-dev-site' },
          { key: 'plain', functionName: 'svc-dev-plain' },
          { key: 'gone', functionName: 'svc-dev-gone' },
        ],
      }),
    ).toEqual([
      { key: 'api', functionName: FN, sessionId: SESSION, owner: 'ada@laptop' },
      {
        key: 'site',
        functionName: 'svc-dev-site',
        sessionId: testSessionId(3),
        owner: 'bob@desk',
      },
    ])
  })

  test('a fallback left by an attach that stopped before moving main is found', async () => {
    const lambdaWeb = deployedStage()
    lambdaWeb.failures.createRevision = [
      undefined,
      Object.assign(new Error('boom'), { name: 'ServiceException' }),
    ]
    await expect(attach(lambdaWeb)).rejects.toThrow('boom')
    expect(
      await findAttachedWebApps({
        lambdaWeb,
        webApps: [{ key: 'api', functionName: FN }],
      }),
    ).toEqual([
      { key: 'api', functionName: FN, sessionId: SESSION, owner: 'unknown' },
    ])
    await restoreWebApp({ lambdaWeb, functionName: FN })
    expect(
      await findAttachedWebApps({
        lambdaWeb,
        webApps: [{ key: 'api', functionName: FN }],
      }),
    ).toEqual([])
  })
})

describe('sessionResourceCounts', () => {
  const session = testSessionId(1)
  const other = testSessionId(2)
  const revisions = [
    { revisionId: 'rev-cfn', description: 'deployed' },
    { revisionId: 'rev-plain' },
    {
      revisionId: 'rev-clone',
      description: `Serverless Dev Mode clone for session ${session}`,
    },
    {
      revisionId: 'rev-dev',
      description: `Serverless Dev Mode dev for session ${session}`,
    },
    {
      revisionId: 'rev-other',
      description: `Serverless Dev Mode dev for session ${other}`,
    },
  ]
  const serving = (endpointName, revisionId) => ({
    endpointName,
    revisionWeights: [{ revisionId, weight: 100 }],
  })
  const endpoints = [
    serving('main', 'rev-cfn'),
    // Counted: a Dev Mode endpoint that serves the session's revision.
    serving('sls-dev-fallback', 'rev-clone'),
    // Not counted: a Dev Mode endpoint of another session.
    serving('sls-dev-local', 'rev-other'),
    // Not counted: an endpoint of the user's, though it serves the session's revision.
    serving('preview', 'rev-dev'),
    // Not counted: an endpoint that serves no revision of the session.
    serving('stable', 'rev-plain'),
  ]

  test("counts only the session's Dev Mode revisions and the Dev Mode endpoints serving them", () => {
    expect(
      sessionResourceCounts({ endpoints, revisions, sessionId: session }),
    ).toEqual({ revisions: 2, endpoints: 1 })
    expect(
      sessionResourceCounts({ endpoints, revisions, sessionId: other }),
    ).toEqual({ revisions: 1, endpoints: 1 })
  })

  test('counts nothing without a session', () => {
    expect(
      sessionResourceCounts({ endpoints, revisions, sessionId: undefined }),
    ).toEqual({ revisions: 0, endpoints: 0 })
  })
})
