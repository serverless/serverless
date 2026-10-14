import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  MIN_DEV_TIMEOUT_SECONDS,
  classifyByConfig,
  classifyFunction,
  configuredArtifactOf,
  resolvedTimeoutSeconds,
  selectFunctions,
} from '../../../../../../../lib/plugins/aws/dev/attach/eligibility.js'

const LAYER = (n) => `arn:aws:lambda:us-east-1:123456789012:layer:user-${n}:1`
const live = (over = {}) => ({
  FunctionName: 'svc-dev-api',
  Runtime: 'nodejs24.x',
  Handler: 'handler.api',
  PackageType: 'Zip',
  Architectures: ['arm64'],
  Layers: [],
  Environment: { Variables: {} },
  RevisionId: 'r1',
  ...over,
})
const context = (over = {}) => ({
  selection: { selected: true },
  sessionId: 's_me',
  owner: 'alice@mbp',
  takeOver: false,
  attachVariables: (variables) => ({
    ...variables,
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
  }),
  ...over,
})
const classify = (config, liveConfig, over) =>
  classifyFunction({
    name: 'api',
    config,
    live: liveConfig,
    context: context(over),
  })
const attachedBy = (owner, session = 's_other') => ({
  Environment: {
    Variables: {
      AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
      SLS_DEV_SESSION: session,
      SLS_DEV_OWNER: owner,
      SLS_DEV_ATTACHED_AT: '1790000000',
    },
  },
})

test.each([
  [
    'not selected',
    {},
    live(),
    { selection: { selected: false, flag: '--function' } },
    'deployed',
    'not_selected',
    'not selected (--function)',
  ],
  [
    'not deployed',
    {},
    null,
    {},
    'skipped',
    'not_deployed',
    'not deployed yet (run serverless deploy)',
  ],
  [
    'earlier Dev Mode shim',
    {},
    live({
      Handler: 'index.handler',
      Environment: {
        Variables: {
          SLS_IOT_ENDPOINT: 'x-ats.iot.us-east-1.amazonaws.com',
          SLS_FUNCTION: 'api',
        },
      },
    }),
    {},
    'skipped',
    'legacy_shim',
    'set up by an earlier version of Dev Mode (run serverless deploy once)',
  ],
  [
    'Lambda@Edge',
    { events: [{ cloudFront: { eventType: 'viewer-request' } }] },
    live(),
    {},
    'deployed',
    'edge_function',
    'Lambda@Edge (not supported)',
  ],
  [
    'container image',
    { image: 'app' },
    live({ PackageType: 'Image', Runtime: undefined }),
    {},
    'deployed',
    'container_image',
    'container image (Dev Mode support planned)',
  ],
  [
    'OS-only runtime',
    {},
    live({ Runtime: 'provided.al2023' }),
    {},
    'deployed',
    'os_only_runtime',
    'OS-only runtime provided.al2023 (Dev Mode support planned)',
  ],
  [
    'Java',
    {},
    live({ Runtime: 'java21' }),
    {},
    'deployed',
    'runtime_not_supported',
    'Java runtime (Dev Mode support planned)',
  ],
  [
    '.NET',
    {},
    live({ Runtime: 'dotnet8' }),
    {},
    'deployed',
    'runtime_not_supported',
    '.NET runtime (Dev Mode support planned)',
  ],
  [
    'Ruby',
    {},
    live({ Runtime: 'ruby3.4' }),
    {},
    'deployed',
    'runtime_not_supported',
    'Ruby runtime (Dev Mode support planned)',
  ],
  [
    'provisioned concurrency',
    { provisionedConcurrency: 2 },
    live(),
    {},
    'deployed',
    'alias_targeted',
    'provisioned concurrency (Dev Mode support planned)',
  ],
  [
    'SnapStart',
    { snapStart: true },
    live({ Runtime: 'python3.13' }),
    {},
    'deployed',
    'alias_targeted',
    'SnapStart (Dev Mode support planned)',
  ],
  [
    'durable',
    { durableConfig: { executionTimeout: 60 } },
    live(),
    {},
    'deployed',
    'alias_targeted',
    'durable function (Dev Mode support planned)',
  ],
  [
    'Managed Instances',
    { capacityProvider: 'cp' },
    live(),
    {},
    'deployed',
    'managed_instances',
    'Managed Instances (Dev Mode support planned)',
  ],
  [
    'Managed Instances seen on the function',
    {},
    live({
      CapacityProviderConfig: {
        LambdaManagedInstancesCapacityProviderConfig: {
          CapacityProviderArn:
            'arn:aws:lambda:us-east-1:123456789012:capacity-provider:cp',
        },
      },
    }),
    {},
    'deployed',
    'managed_instances',
    'Managed Instances (Dev Mode support planned)',
  ],
  [
    'five layers',
    {},
    live({ Layers: [1, 2, 3, 4, 5].map((n) => ({ Arn: LAYER(n) })) }),
    {},
    'deployed',
    'no_free_layer_slot',
    'already uses 5 layers',
  ],
  [
    'env unreadable',
    {},
    live({
      Environment: {
        Error: {
          ErrorCode: 'KMSAccessDeniedException',
          Message: 'Lambda was unable to decrypt the environment variables',
        },
      },
    }),
    {},
    'deployed',
    'env_unreadable',
    'its environment variables are encrypted with a KMS key you cannot decrypt (needs kms:Decrypt)',
  ],
  [
    'env without variables',
    {},
    live({ Environment: {} }),
    {},
    'deployed',
    'env_unreadable',
    'its environment variables are encrypted with a KMS key you cannot decrypt (needs kms:Decrypt)',
  ],
  [
    'env too large',
    {},
    live(),
    { attachVariables: () => ({ BIG: 'x'.repeat(4087) }) },
    'deployed',
    'env_too_large',
    'its environment variables would exceed the 4 KB limit',
  ],
  [
    'another developer',
    {},
    live(attachedBy('bob@desk')),
    {},
    'skipped',
    'owned_by_other_session',
    'in Dev Mode for bob@desk (--take-over to take it)',
  ],
  [
    'handler only in package.artifact',
    { handler: 'dist/handler.api', package: { artifact: 'build/api.zip' } },
    live(),
    {
      artifact: 'build/api.zip',
      serviceDir: path.join(os.tmpdir(), 'sls-dev-no-such-service'),
    },
    'deployed',
    'handler_not_in_service',
    "its handler is only in package.artifact, not in this service's files",
  ],
])('%s', (_label, config, liveConfig, over, mode, reason, why) => {
  expect(classify(config, liveConfig, over)).toMatchObject({
    function: 'api',
    mode,
    reason,
    why,
  })
})

test('a function that sets a variable Dev Mode writes itself stays deployed, naming it, so its value is never lost', () => {
  const result = classify(
    {},
    live({
      Environment: {
        Variables: { SLS_DEV_VERSION: '2.1.0', SLS_DEV_OWNER: 'ops', A: '1' },
      },
    }),
  )
  expect(result).toMatchObject({
    mode: 'deployed',
    reason: 'reserved_variable',
    why: 'sets SLS_DEV_VERSION and SLS_DEV_OWNER, which Dev Mode uses (rename them to use Dev Mode)',
  })
  // The other SLS_DEV_ names (Dashboard's, the wrapper's) are not Dev Mode's undo record.
  expect(
    classify(
      {},
      live({
        Environment: {
          Variables: { SLS_DEV_MODE_ORG_ID: 'org', SLS_DEV_TOKEN: 't' },
        },
      }),
    ).mode,
  ).toBe('dev')
  // A function Dev Mode attached carries them: it is classified as attached, not as reserved.
  expect(
    classify({}, live(attachedBy('alice@mbp', 's_earlier')), {
      liveness: new Map([['s_earlier', 'gone']]),
    }).reason,
  ).not.toBe('reserved_variable')
})

test("a function's own SLS_DEV_SESSION, without Dev Mode's undo record, is a reserved name, not an attachment", () => {
  const result = classify(
    {},
    live({ Environment: { Variables: { SLS_DEV_SESSION: 'mine', A: '1' } } }),
    { takeOver: true },
  )
  expect(result).toMatchObject({
    mode: 'deployed',
    reason: 'reserved_variable',
    why: 'sets SLS_DEV_SESSION, which Dev Mode uses (rename it to use Dev Mode)',
  })
})

test('a variable the Dev Mode wrapper or bridge reads is reserved, attached or not', () => {
  expect(
    classify(
      {},
      live({
        Environment: { Variables: { SLS_DEV_BRIDGE_PORT: '0', A: '1' } },
      }),
    ),
  ).toMatchObject({
    mode: 'deployed',
    reason: 'reserved_variable',
    why: 'sets SLS_DEV_BRIDGE_PORT, which Dev Mode uses (rename it to use Dev Mode)',
  })
  const attached = attachedBy('alice@mbp', 's_earlier')
  attached.Environment.Variables.SLS_DEV_REAL_RUNTIME_API = '127.0.0.1:1'
  expect(
    classify({}, live(attached), {
      liveness: new Map([['s_earlier', 'gone']]),
    }),
  ).toMatchObject({ mode: 'deployed', reason: 'reserved_variable' })
})

describe('a layer named like Dev Mode on a function Dev Mode did not attach', () => {
  const FN = 'arn:aws:lambda:us-east-1:123456789012:function:svc-dev-api'
  const SAME_NAME =
    'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:7'
  const withLayer = (layerArn, variables = { A: '1' }) =>
    live({
      FunctionArn: FN,
      Layers: [{ Arn: layerArn }, { Arn: LAYER(1) }],
      Environment: { Variables: variables },
    })

  test('keeps its deployed code: attaching would replace that layer', () => {
    expect(classify({}, withLayer(SAME_NAME))).toEqual({
      function: 'api',
      mode: 'deployed',
      reason: 'layer_name_taken',
      why: "uses a layer named serverless-dev-arm64 without Dev Mode's settings (remove that layer from the function, or publish yours under another name, to use Dev Mode)",
      notes: [],
    })
    expect(
      classify(
        {},
        withLayer(
          SAME_NAME.replace('serverless-dev-arm64', 'serverless-dev-x86_64'),
        ),
      ).why,
    ).toBe(
      "uses a layer named serverless-dev-x86_64 without Dev Mode's settings (remove that layer from the function, or publish yours under another name, to use Dev Mode)",
    )
  })

  test('a Dev Mode layer left without its wrapper and variables is replaced: the function runs here', () => {
    const published = { devModeLayerVersions: new Set([SAME_NAME]) }
    expect(classify({}, withLayer(SAME_NAME), published)).toMatchObject({
      mode: 'dev',
    })
    // What Dev Mode left of its own variables beside it is Dev Mode's too.
    expect(
      classify(
        {},
        withLayer(SAME_NAME, {
          SLS_DEV_VERSION: '1',
          SLS_DEV_ATTACHED_AT: '1790000000',
        }),
        published,
      ),
    ).toMatchObject({ mode: 'dev' })
    // A name the wrapper reads stays reserved whatever the layer.
    expect(
      classify(
        {},
        withLayer(SAME_NAME, { SLS_DEV_BRIDGE_PORT: '0' }),
        published,
      ),
    ).toMatchObject({ mode: 'deployed', reason: 'reserved_variable' })
  })

  test('an incomplete undo record of its own is refused as before, by its variable', () => {
    expect(
      classify({}, withLayer(SAME_NAME, { SLS_DEV_SESSION: 'mine' })),
    ).toMatchObject({ mode: 'deployed', reason: 'reserved_variable' })
  })

  test('a function Dev Mode attached runs here as before', () => {
    const attached = attachedBy('alice@mbp', 's_earlier').Environment.Variables
    expect(
      classify({}, withLayer(SAME_NAME, attached), {
        liveness: new Map([['s_earlier', 'gone']]),
      }).mode,
    ).toBe('dev')
  })

  test('a layer of that name from another account is just another layer', () => {
    expect(
      classify({}, withLayer(SAME_NAME.replace('123456789012', '210987654321')))
        .mode,
    ).toBe('dev')
  })
})

test('the first matching row wins', () => {
  expect(
    classify(
      { events: [{ cloudFront: { eventType: 'viewer-request' } }] },
      live({ Runtime: 'java21' }),
    ),
  ).toMatchObject({ reason: 'edge_function' })
})

test('an eligible Node function is dev with its architecture', () => {
  expect(classify({}, live())).toEqual({
    function: 'api',
    mode: 'dev',
    notes: [],
    arch: 'arm64',
  })
})

test('Python runs in dev mode on x86_64', () => {
  expect(
    classify({}, live({ Runtime: 'python3.13', Architectures: ['x86_64'] })),
  ).toMatchObject({ mode: 'dev', arch: 'x86_64' })
})

test('four user layers plus an old Dev Mode layer still leave a slot', () => {
  const OLD =
    'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:2'
  const layers = [1, 2, 3, 4].map((n) => ({ Arn: LAYER(n) }))
  layers.push({ Arn: OLD })
  // Left without Dev Mode's wrapper and variables; its version is one Dev Mode published.
  expect(
    classify({}, live({ Layers: layers }), {
      devModeLayerVersions: new Set([OLD]),
    }),
  ).toMatchObject({ mode: 'dev' })
  // Left attached by an earlier session of yours, with Dev Mode's wrapper.
  expect(
    classify({}, live({ Layers: layers, ...attachedBy('alice@mbp', 's_x') })),
  ).toMatchObject({ mode: 'dev' })
})

test('--take-over attaches a function another developer holds', () => {
  const row = classify({}, live(attachedBy('bob@desk')), { takeOver: true })
  expect(row.mode).toBe('dev')
  expect(row.notes).toEqual([
    { reason: 'taken_over', message: 'taken over from bob@desk' },
  ])
})

test('your own earlier session is re-attached without --take-over', () => {
  const row = classify({}, live(attachedBy('alice@mbp', 's_crashed')))
  expect(row.mode).toBe('dev')
  expect(row.notes[0].reason).toBe('reattached')
  expect(row.attachment).toEqual({
    session: 's_crashed',
    owner: 'alice@mbp',
    attachedAt: 1790000000,
  })
})

test('VPC functions stay in dev mode with an egress note', () => {
  const row = classify(
    {},
    live({
      VpcConfig: { SubnetIds: ['subnet-1'], SecurityGroupIds: ['sg-1'] },
    }),
  )
  expect(row.mode).toBe('dev')
  expect(row.notes).toEqual([
    {
      reason: 'vpc_egress_required',
      message: 'needs outbound access to AWS IoT Core, STS and S3 (VPC)',
    },
  ])
})

describe('a function attached by another session, by whether that session is running', () => {
  const classifyWith = (owner, liveness, over = {}) =>
    classify({}, live(attachedBy(owner, 's_other')), { liveness, ...over })
  const state = (value) => new Map([['s_other', value]])

  test.each([
    ['live', 'bob@desk', 'in Dev Mode for bob@desk (--take-over to take it)'],
    [
      'unknown',
      'bob@desk',
      'in Dev Mode for bob@desk (--take-over to take it)',
    ],
    [
      'live',
      'alice@mbp',
      'in Dev Mode in another session of yours (--take-over to take it)',
    ],
    [
      'unknown',
      'alice@mbp',
      'in Dev Mode in another session of yours (--take-over to take it)',
    ],
  ])('a %s session of %s keeps it', (value, owner, why) => {
    expect(classifyWith(owner, state(value))).toMatchObject({
      mode: 'skipped',
      reason: 'owned_by_other_session',
      why,
      attachment: { session: 's_other', owner },
    })
  })

  test.each([
    ['live', 'alice@mbp', 'taken over from another session of yours'],
    ['unknown', 'alice@mbp', 'taken over from another session of yours'],
    ['live', 'bob@desk', 'taken over from bob@desk'],
    ['unknown', 'bob@desk', 'taken over from bob@desk'],
  ])(
    '--take-over takes it from a %s session of %s, with a note',
    (value, owner, message) => {
      const row = classifyWith(owner, state(value), { takeOver: true })
      expect(row.mode).toBe('dev')
      expect(row.notes).toEqual([{ reason: 'taken_over', message }])
    },
  )

  test.each([false, true])(
    'a gone session of yours is re-attached (--take-over: %s)',
    (takeOver) => {
      const row = classifyWith('alice@mbp', state('gone'), { takeOver })
      expect(row.mode).toBe('dev')
      expect(row.notes).toEqual([
        {
          reason: 'reattached',
          message: 'left in Dev Mode by an earlier session of yours',
        },
      ])
    },
  )

  test.each([false, true])(
    "a gone session of someone else's is taken, with a note (--take-over: %s)",
    (takeOver) => {
      const row = classifyWith('bob@desk', state('gone'), { takeOver })
      expect(row.mode).toBe('dev')
      expect(row.notes).toEqual([
        {
          reason: 'taken_over',
          message: 'taken over from bob@desk, whose session has ended',
        },
      ])
    },
  )

  test.each([
    ['denied', state('denied')],
    ['failed', state('failed')],
    ['not asked', undefined],
  ])('without an answer (%s) the earlier rule applies', (_label, liveness) => {
    expect(classifyWith('alice@mbp', liveness).notes).toEqual([
      {
        reason: 'reattached',
        message: 'left in Dev Mode by an earlier session of yours',
      },
    ])
    expect(classifyWith('bob@desk', liveness)).toMatchObject({
      mode: 'skipped',
      reason: 'owned_by_other_session',
      why: 'in Dev Mode for bob@desk (--take-over to take it)',
    })
    expect(
      classifyWith('bob@desk', liveness, { takeOver: true }).notes,
    ).toEqual([{ reason: 'taken_over', message: 'taken over from bob@desk' }])
  })

  // Every session found when this one looked was asked about: one without an entry attached
  // after that, so it was running moments ago.
  test.each([
    [
      'alice@mbp',
      'in Dev Mode in another session of yours (--take-over to take it)',
    ],
    ['bob@desk', 'in Dev Mode for bob@desk (--take-over to take it)'],
  ])(
    'a session not in the answers of %s keeps it, as a running one',
    (owner, why) => {
      const asked = new Map([['s_third', 'gone']])
      expect(classifyWith(owner, asked)).toMatchObject({
        mode: 'skipped',
        reason: 'owned_by_other_session',
        why,
      })
      expect(classifyWith(owner, asked, { takeOver: true }).notes).toEqual([
        {
          reason: 'taken_over',
          message:
            owner === 'alice@mbp'
              ? 'taken over from another session of yours'
              : 'taken over from bob@desk',
        },
      ])
    },
  )

  test('this session is never asked about: its own functions stay dev', () => {
    const row = classify({}, live(attachedBy('alice@mbp', 's_me')), {
      liveness: new Map([['s_me', 'live']]),
    })
    expect(row).toMatchObject({ mode: 'dev', notes: [] })
  })
})

test('odd config never throws', () => {
  expect(() =>
    classify({ events: ['http', null, { http: {} }] }, live()),
  ).not.toThrow()
  expect(() =>
    classify(
      undefined,
      live({
        Environment: undefined,
        Layers: undefined,
        Architectures: undefined,
      }),
    ),
  ).not.toThrow()
})

test('selectFunctions applies --function and --skip-function', () => {
  const selection = selectFunctions({
    names: ['a', 'b', 'c'],
    only: ['a', 'b'],
    skip: ['b'],
  })
  expect(selection.get('a')).toEqual({ selected: true })
  expect(selection.get('b')).toEqual({
    selected: false,
    flag: '--skip-function',
  })
  expect(selection.get('c')).toEqual({ selected: false, flag: '--function' })
  expect(selectFunctions({ names: ['a'] }).get('a')).toEqual({ selected: true })
})

test('selectFunctions rejects a name that is not in serverless.yml', () => {
  expect(() => selectFunctions({ names: ['a'], only: ['nope'] })).toThrow(
    expect.objectContaining({ code: 'DEV_MODE_UNKNOWN_FUNCTION' }),
  )
})

test('classifyByConfig rules out, from serverless.yml alone, what can never run in dev', () => {
  const reason = (config, runtime = 'nodejs24.x', selection) =>
    classifyByConfig({ name: 'f', config, runtime, selection })?.reason ?? null
  expect(reason({ image: 'uri' })).toBe('container_image')
  expect(reason({}, 'provided.al2023')).toBe('os_only_runtime')
  expect(reason({}, 'java21')).toBe('runtime_not_supported')
  expect(reason({ provisionedConcurrency: 1 })).toBe('alias_targeted')
  expect(reason({ capacityProvider: 'cp' })).toBe('managed_instances')
  expect(reason({ events: [{ cloudFront: {} }] })).toBe('edge_function')
  expect(
    reason({}, 'nodejs24.x', { selected: false, flag: '--function' }),
  ).toBe('not_selected')
  // May run in dev once deployed; an unknown runtime is never a reason on its own.
  expect(reason({}, 'python3.13')).toBeNull()
  expect(reason({}, undefined)).toBeNull()
  expect(
    classifyByConfig({ name: 'f', config: { events: [{ cloudFront: {} }] } }),
  ).toMatchObject({
    function: 'f',
    mode: 'deployed',
    why: 'Lambda@Edge (not supported)',
  })
})
test('a Python function on a machine without Python stays deployed, saying what to install', () => {
  expect(
    classify({}, live({ Runtime: 'python3.13', Architectures: ['x86_64'] }), {
      localRuntimes: {
        python: { available: false, command: null, version: null },
      },
    }),
  ).toMatchObject({
    mode: 'deployed',
    reason: 'local_runtime_missing',
    why: 'Python not found on this machine (install Python 3.13, or create .venv in the service directory)',
  })
})

test('with Python present, or without a local runtime check, a Python function is dev', () => {
  expect(classify({}, live({ Runtime: 'python3.13' })).mode).toBe('dev')
  expect(
    classify({}, live({ Runtime: 'python3.13' }), {
      localRuntimes: { python: { available: true, version: '3.13.8' } },
    }).mode,
  ).toBe('dev')
})

test('a runtime the local check did not cover stays deployed instead of running without an interpreter', () => {
  expect(
    classify({}, live({ Runtime: 'python3.13' }), {
      localRuntimes: { node: { available: true, version: '24.21.0' } },
    }),
  ).toMatchObject({
    mode: 'deployed',
    reason: 'local_runtime_missing',
    why: 'Python not found on this machine (install Python 3.13, or create .venv in the service directory)',
  })
  expect(
    classifyByConfig({
      name: 'api',
      config: {},
      runtime: 'nodejs20.x',
      localRuntimes: {},
    }),
  ).toMatchObject({
    mode: 'deployed',
    reason: 'local_runtime_missing',
    why: 'Node.js 18.19, 20.6 or later needed on this machine',
  })
})

test('a runtime without an adapter is runtime_not_supported before any local check', () => {
  expect(
    classify({}, live({ Runtime: 'ruby3.4' }), {
      localRuntimes: { python: { available: false } },
    }).reason,
  ).toBe('runtime_not_supported')
})

test('classifyByConfig also rules out a Python function this machine cannot run', () => {
  expect(
    classifyByConfig({
      name: 'py',
      config: {},
      runtime: 'python3.12',
      localRuntimes: { python: { available: false } },
    }),
  ).toMatchObject({ mode: 'deployed', reason: 'local_runtime_missing' })
  expect(
    classifyByConfig({ name: 'py', config: {}, runtime: 'python3.12' }),
  ).toBeNull()
})

test('a Node.js function on a Node.js too old for Dev Mode stays deployed, saying which it needs', () => {
  expect(
    classify({}, live(), {
      localRuntimes: {
        node: { available: false, command: null, version: '18.18.2' },
      },
    }),
  ).toMatchObject({
    mode: 'deployed',
    reason: 'local_runtime_missing',
    why: 'Node.js 18.18.2 on this machine (Dev Mode needs Node.js 18.19, 20.6 or later)',
  })
})

describe('an MCP server function, whose local entry is built for Node.js 20', () => {
  const node = (version, available = true) => ({
    localRuntimes: {
      node: { available, command: available ? 'node' : null, version },
    },
  })

  test('on Node.js 18.19 or 19 it stays deployed with local_runtime_missing; a plain Node.js function is dev', () => {
    for (const version of ['18.19.0', '18.20.8']) {
      expect(classify({}, live(), { ...node(version), mcp: true })).toEqual({
        function: 'api',
        mode: 'deployed',
        reason: 'local_runtime_missing',
        why: `Node.js ${version} on this machine (MCP servers need Node.js 20.6 or later)`,
        notes: [],
      })
      expect(classify({}, live(), node(version)).mode).toBe('dev')
      expect(
        classifyByConfig({
          name: 'crm',
          config: {},
          runtime: 'nodejs24.x',
          mcp: true,
          ...node(version),
        }),
      ).toMatchObject({
        mode: 'deployed',
        reason: 'local_runtime_missing',
        why: `Node.js ${version} on this machine (MCP servers need Node.js 20.6 or later)`,
      })
      expect(
        classifyByConfig({
          name: 'api',
          config: {},
          runtime: 'nodejs24.x',
          ...node(version),
        }),
      ).toBeNull()
    }
  })

  test('on Node.js 20.6 or later it is dev, as before', () => {
    for (const version of ['20.6.0', '22.11.0', '24.21.0']) {
      expect(classify({}, live(), { ...node(version), mcp: true }).mode).toBe(
        'dev',
      )
      expect(
        classifyByConfig({
          name: 'crm',
          config: {},
          runtime: 'nodejs24.x',
          mcp: true,
          ...node(version),
        }),
      ).toBeNull()
    }
  })

  test('on a Node.js no function can run on, the Why names the MCP floor', () => {
    expect(
      classify({}, live(), { ...node('20.3.0', false), mcp: true }),
    ).toMatchObject({
      reason: 'local_runtime_missing',
      why: 'Node.js 20.3.0 on this machine (MCP servers need Node.js 20.6 or later)',
    })
    expect(classify({}, live(), node('20.3.0', false)).why).toBe(
      'Node.js 20.3.0 on this machine (Dev Mode needs Node.js 18.19, 20.6 or later)',
    )
    expect(
      classifyByConfig({
        name: 'crm',
        config: {},
        runtime: 'nodejs24.x',
        mcp: true,
        localRuntimes: {},
      }),
    ).toMatchObject({
      reason: 'local_runtime_missing',
      why: 'Node.js 20.6 or later needed on this machine',
    })
  })
})

test('a Python function on a Python older than Dev Mode supports stays deployed, saying which it needs', () => {
  expect(
    classify({}, live({ Runtime: 'python3.13' }), {
      localRuntimes: {
        python: { available: false, command: null, version: '3.8.18' },
      },
    }),
  ).toMatchObject({
    mode: 'deployed',
    reason: 'local_runtime_missing',
    why: 'Python 3.8.18 on this machine (Dev Mode needs Python 3.9 or later)',
  })
})

describe('a function whose timeout is too short to run on this machine', () => {
  test('a live timeout under 3 s stays on the deployed code, and the table says why', () => {
    expect(MIN_DEV_TIMEOUT_SECONDS).toBe(3)
    for (const Timeout of [1, 2]) {
      expect(classify({}, live({ Timeout }))).toMatchObject({
        mode: 'deployed',
        reason: 'timeout_too_short',
        why: `timeout of ${Timeout}s is too short to run on this machine`,
      })
    }
    expect(classify({}, live({ Timeout: 3 })).mode).toBe('dev')
  })

  test('the timeout the function runs with counts, not the one in serverless.yml', () => {
    expect(classify({ timeout: 30 }, live({ Timeout: 2 })).reason).toBe(
      'timeout_too_short',
    )
    expect(classify({ timeout: 2 }, live({ Timeout: 30 })).mode).toBe('dev')
  })

  test('a reason found earlier still wins', () => {
    expect(classify({}, live({ Runtime: 'java21', Timeout: 1 })).reason).toBe(
      'runtime_not_supported',
    )
  })

  test('before the first deployment the resolved timeout decides', () => {
    const byConfig = (timeout) =>
      classifyByConfig({
        name: 'api',
        config: {},
        runtime: 'nodejs24.x',
        timeout,
      })
    expect(byConfig(2)).toMatchObject({
      mode: 'deployed',
      reason: 'timeout_too_short',
      why: 'timeout of 2s is too short to run on this machine',
    })
    expect(byConfig(3)).toBeNull()
    expect(byConfig(undefined)).toBeNull()
  })

  test("the resolved timeout is the function's, else the provider's, else 6 s", () => {
    expect(resolvedTimeoutSeconds({ timeout: 2 }, { timeout: 30 })).toBe(2)
    expect(resolvedTimeoutSeconds({}, { timeout: 1 })).toBe(1)
    expect(resolvedTimeoutSeconds({}, {})).toBe(6)
    expect(resolvedTimeoutSeconds({ timeout: '20' }, undefined)).toBe(20)
  })

  test('a timeout that is not a number before the deployment (a CloudFormation reference) is not checked', () => {
    const ref = { Ref: 'TimeoutParameter' }
    expect(resolvedTimeoutSeconds({ timeout: ref }, { timeout: 1 })).toBe(
      undefined,
    )
    expect(resolvedTimeoutSeconds({}, { timeout: ref })).toBe(undefined)
    expect(resolvedTimeoutSeconds({ timeout: 'soon' }, undefined)).toBe(
      undefined,
    )
    expect(resolvedTimeoutSeconds({ timeout: 10 }, { timeout: ref })).toBe(10)
  })

  test('a timeout too short wins over a missing local runtime', () => {
    const missing = {
      python: { available: false, command: null, version: '3.8.18' },
    }
    expect(
      classify({}, live({ Runtime: 'python3.13', Timeout: 2 }), {
        localRuntimes: missing,
      }).reason,
    ).toBe('timeout_too_short')
    expect(
      classifyByConfig({
        name: 'api',
        config: {},
        runtime: 'python3.13',
        timeout: 2,
        localRuntimes: missing,
      }).reason,
    ).toBe('timeout_too_short')
  })
})

describe('a function whose environment points the AWS SDKs at custom endpoints', () => {
  const withVariables = (Variables) => live({ Environment: { Variables } })

  test.each([
    ['AWS_USE_FIPS_ENDPOINT', 'true'],
    ['AWS_USE_FIPS_ENDPOINT', 'TRUE'],
    ['AWS_ENDPOINT_URL', 'https://proxy.internal.example'],
    ['AWS_ENDPOINT_URL_STS', 'https://sts.internal.example'],
    ['AWS_ENDPOINT_URL_IOT_DATA_PLANE', 'https://iot.internal.example'],
    ['AWS_CA_BUNDLE', '/var/task/ca.pem'],
  ])(
    '%s=%s stays on the deployed code, and the table names it',
    (name, value) => {
      expect(classify({}, withVariables({ [name]: value }))).toMatchObject({
        mode: 'deployed',
        reason: 'custom_aws_endpoints',
        why: `uses custom AWS endpoints (${name})`,
      })
    },
  )

  test('every variable set is named', () => {
    expect(
      classify(
        {},
        withVariables({
          AWS_CA_BUNDLE: '/var/task/ca.pem',
          AWS_USE_FIPS_ENDPOINT: 'true',
        }),
      ).why,
    ).toBe('uses custom AWS endpoints (AWS_USE_FIPS_ENDPOINT, AWS_CA_BUNDLE)')
  })

  test('AWS_USE_FIPS_ENDPOINT=false, empty values and endpoints of other services stay attachable', () => {
    for (const Variables of [
      { AWS_USE_FIPS_ENDPOINT: 'false' },
      { AWS_USE_FIPS_ENDPOINT: '' },
      { AWS_ENDPOINT_URL: '' },
      { AWS_CA_BUNDLE: '  ' },
      { AWS_ENDPOINT_URL_DYNAMODB: 'http://localhost:8000' },
    ]) {
      expect(classify({}, withVariables(Variables)).mode).toBe('dev')
    }
  })

  test('a reason found earlier still wins', () => {
    expect(
      classify(
        {},
        live({
          Runtime: 'java21',
          Environment: { Variables: { AWS_CA_BUNDLE: '/var/task/ca.pem' } },
        }),
      ).reason,
    ).toBe('runtime_not_supported')
  })
})

describe('a function deployed from package.artifact', () => {
  const dirs = []
  afterAll(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
  })
  const serviceWith = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-artifact-'))
    dirs.push(dir)
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
      fs.writeFileSync(path.join(dir, name), content)
    }
    return dir
  }
  const ARTIFACT = { package: { artifact: 'build/api.zip' } }
  // Both ways a session decides: from the deployed function, and from serverless.yml alone.
  const both = ({ runtime, config, serviceDir, artifact }) => [
    classifyFunction({
      name: 'api',
      config,
      live: live({ Runtime: runtime }),
      context: context({ artifact, serviceDir }),
    }),
    classifyByConfig({
      name: 'api',
      config,
      runtime,
      timeout: 6,
      artifact,
      serviceDir,
    }) ?? { mode: 'dev' },
  ]

  describe.each([
    ['Node.js', 'nodejs24.x', 'src/api.handler', 'src/api.ts'],
    ['Python', 'python3.13', 'src/app.handler', 'src/app.py'],
  ])('on %s', (_, runtime, handler, source) => {
    test('stays on its deployed code when its handler is only in the artifact', () => {
      const serviceDir = serviceWith({ 'serverless.yml': '' })
      for (const result of both({
        runtime,
        config: { handler, ...ARTIFACT },
        serviceDir,
        artifact: 'build/api.zip',
      })) {
        expect(result).toMatchObject({
          mode: 'deployed',
          reason: 'handler_not_in_service',
          why: "its handler is only in package.artifact, not in this service's files",
        })
      }
    })

    test('is attached when its source is in the service directory too', () => {
      const serviceDir = serviceWith({ [source]: '' })
      for (const result of both({
        runtime,
        config: { handler, ...ARTIFACT },
        serviceDir,
        artifact: 'build/api.zip',
      })) {
        expect(result.mode).toBe('dev')
      }
    })

    test('without an artifact, a missing handler file changes nothing here', () => {
      const serviceDir = serviceWith({ 'serverless.yml': '' })
      for (const result of both({
        runtime,
        config: { handler },
        serviceDir,
        artifact: null,
      })) {
        expect(result.mode).toBe('dev')
      }
    })
  })

  test('a Python handler in a package, or under its module directory, is found', () => {
    const inPackage = serviceWith({ 'app/__init__.py': '' })
    expect(
      both({
        runtime: 'python3.13',
        config: { handler: 'app.handler', ...ARTIFACT },
        serviceDir: inPackage,
        artifact: 'build/api.zip',
      }).map((result) => result.mode),
    ).toEqual(['dev', 'dev'])
    const inModule = serviceWith({ 'functions/orders/main.py': '' })
    expect(
      both({
        runtime: 'python3.13',
        config: {
          handler: 'main.handler',
          module: 'functions/orders',
          ...ARTIFACT,
        },
        serviceDir: inModule,
        artifact: 'build/api.zip',
      }).map((result) => result.mode),
    ).toEqual(['dev', 'dev'])
  })

  test("the artifact is the function's own, else the service's unless the function is packaged individually", () => {
    expect(
      configuredArtifactOf({
        config: { package: { artifact: 'fn.zip' } },
        servicePackage: { artifact: 'svc.zip' },
      }),
    ).toBe('fn.zip')
    expect(
      configuredArtifactOf({
        config: {},
        servicePackage: { artifact: 'svc.zip' },
      }),
    ).toBe('svc.zip')
    expect(
      configuredArtifactOf({
        config: { package: { individually: true } },
        servicePackage: { artifact: 'svc.zip' },
      }),
    ).toBeNull()
    expect(configuredArtifactOf({ config: {}, servicePackage: {} })).toBeNull()
  })
})
