import {
  ENV,
  WRAPPER_PATH,
} from '../../../../../../../lib/plugins/aws/dev/attach/naming.js'
import {
  attachLayers,
  buildAttachVariables,
  buildRestoreVariables,
  detachLayers,
  envSize,
  fitsEnvBudget,
  isAttached,
  layerArnsOf,
  layersFingerprint,
  readAttachment,
  variablesOf,
} from '../../../../../../../lib/plugins/aws/dev/attach/undo-record.js'
import { testSessionId } from './fakes.js'

const session = {
  id: testSessionId(1),
  owner: 'alice@mbp',
  attachedAt: 1790000000,
  broker: {
    arn: 'arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1',
    externalId: '0123456789abcdef0123456789abcdef',
  },
}
const DEV = 'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:3'
const OLD_DEV =
  'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:2'
const DASH_NODE =
  'arn:aws:lambda:us-east-1:177335420605:layer:sls-sdk-node-v0-15-15:1'
const DASH_NODE_NEWER =
  'arn:aws:lambda:us-east-1:177335420605:layer:sls-sdk-node-v0-15-16:1'
const OTEL =
  'arn:aws:lambda:us-east-1:901920570463:layer:aws-otel-nodejs-arm64:1'

const roundTrip = (live, layers) => {
  const attached = buildAttachVariables({
    live,
    otherLayerArns: layers,
    session,
  })
  const remaining = detachLayers(attachLayers(layers, DEV))
  return {
    attached,
    remaining,
    restored: buildRestoreVariables({
      live: attached,
      remainingLayerArns: remaining,
    }),
  }
}

test('attach adds the wrapper and the undo record and keeps user variables', () => {
  const { attached } = roundTrip({ TABLE: 'orders' }, [])
  expect(attached).toEqual({
    TABLE: 'orders',
    AWS_LAMBDA_EXEC_WRAPPER: WRAPPER_PATH,
    SLS_DEV_VERSION: '1',
    SLS_DEV_SESSION: testSessionId(1),
    SLS_DEV_OWNER: 'alice@mbp',
    SLS_DEV_ATTACHED_AT: '1790000000',
    SLS_DEV_BROKER_ROLE_ARN: session.broker.arn,
    SLS_DEV_BROKER_EXTERNAL_ID: session.broker.externalId,
  })
})

test('attach then restore gives back exactly the original variables and layers', () => {
  const live = { TABLE: 'orders', NODE_OPTIONS: '--enable-source-maps' }
  const { restored, remaining } = roundTrip(live, [OTEL])
  expect(restored).toEqual(live)
  expect(remaining).toEqual([OTEL])
})

test('restore keeps look-alike SLS_DEV_* variables and reinstates the Dashboard wrapper', () => {
  const live = {
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
    SLS_ORG_ID: 'org-1',
    SLS_DEV_MODE_ORG_ID: 'org-1',
    SLS_DEV_TOKEN: 'token',
    SLS_DEV_SOMETHING: 'the user owns this one',
    SERVERLESS_PLATFORM_STAGE: 'prod',
  }
  const { attached, restored, remaining } = roundTrip(live, [DASH_NODE])
  expect(attached[ENV.ORIGINAL_WRAPPER]).toBe(
    '/opt/sls-sdk-node/exec-wrapper.sh',
  )
  expect(attached[ENV.ORIGINAL_WRAPPER_LAYER]).toBe(DASH_NODE)
  expect(restored).toEqual(live)
  expect(remaining).toEqual([DASH_NODE])
})

test('the Dashboard wrapper is dropped when its layer vanished during the session', () => {
  const attached = buildAttachVariables({
    live: { AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh' },
    otherLayerArns: [DASH_NODE],
    session,
  })
  expect(
    buildRestoreVariables({ live: attached, remainingLayerArns: [] }),
  ).toEqual({})
})

test('a newer Dashboard layer version still provides the wrapper', () => {
  const attached = buildAttachVariables({
    live: { AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh' },
    otherLayerArns: [DASH_NODE],
    session,
  })
  expect(
    buildRestoreVariables({
      live: attached,
      remainingLayerArns: [DASH_NODE_NEWER],
    }),
  ).toEqual({ AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh' })
})

test('a wrapper someone else set during the session is left alone', () => {
  const attached = buildAttachVariables({
    live: {},
    otherLayerArns: [],
    session,
  })
  const live = {
    ...attached,
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
  }
  expect(
    buildRestoreVariables({ live, remainingLayerArns: [DASH_NODE] }),
  ).toEqual({
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
  })
})

test('an unmapped /opt wrapper comes back only while the other layers are unchanged', () => {
  const live = { AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-instrument' }
  const attached = buildAttachVariables({
    live,
    otherLayerArns: [OTEL],
    session,
  })
  expect(attached[ENV.LAYERS_AT_ATTACH]).toMatch(/^[0-9a-f]{16}$/)
  expect(
    buildRestoreVariables({ live: attached, remainingLayerArns: [OTEL] }),
  ).toEqual(live)
  expect(
    buildRestoreVariables({ live: attached, remainingLayerArns: [] }),
  ).toEqual({})
})

test('a wrapper from the function code always comes back', () => {
  const live = { AWS_LAMBDA_EXEC_WRAPPER: '/var/task/wrapper.sh' }
  const { restored } = roundTrip(live, [])
  expect(restored).toEqual(live)
})

test('re-attach keeps the recorded original wrapper', () => {
  const first = buildAttachVariables({
    live: { AWS_LAMBDA_EXEC_WRAPPER: '/var/task/wrapper.sh' },
    otherLayerArns: [],
    session,
  })
  const again = buildAttachVariables({
    live: first,
    otherLayerArns: [],
    session: { ...session, id: testSessionId(2) },
  })
  expect(again[ENV.ORIGINAL_WRAPPER]).toBe('/var/task/wrapper.sh')
  expect(again[ENV.SESSION]).toBe(testSessionId(2))
  expect(again.AWS_LAMBDA_EXEC_WRAPPER).toBe(WRAPPER_PATH)
})

test('self-referencing original is dropped', () => {
  const broken = {
    AWS_LAMBDA_EXEC_WRAPPER: WRAPPER_PATH,
    [ENV.ORIGINAL_WRAPPER]: WRAPPER_PATH,
    [ENV.SESSION]: 's_old',
  }
  expect(
    buildAttachVariables({ live: broken, otherLayerArns: [], session })[
      ENV.ORIGINAL_WRAPPER
    ],
  ).toBeUndefined()
  expect(
    buildRestoreVariables({ live: broken, remainingLayerArns: [] }),
  ).toEqual({})
})

test("the env budget is Lambda's: 4096 bytes of compact JSON", () => {
  expect(envSize({ BIG: 'x'.repeat(4086) })).toBe(4096)
})

test('the budget counts the real variables, with no reserve on top', () => {
  const pad = (n) => ({ PAD: 'x'.repeat(n) })
  const size = (vars) => Buffer.byteLength(JSON.stringify(vars))
  const exact = pad(4096 - size(pad(0)))
  expect(size(exact)).toBe(4096)
  expect(fitsEnvBudget(exact)).toBe(true)
  expect(fitsEnvBudget(pad(4096 - size(pad(0)) + 1))).toBe(false)
})

test('the attach variables carry the session key and the AWS IoT Core endpoint, and restore removes them', () => {
  const withRelay = {
    id: 's_0123456789ab',
    owner: 'dev@machine',
    attachedAt: 1790000000,
    broker: {
      arn: 'arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1',
      externalId: 'a'.repeat(32),
    },
    key: Buffer.alloc(32, 7).toString('base64'),
    iotEndpoint: 'abcdefghijklmn-ats.iot.us-east-1.amazonaws.com',
  }
  const attached = buildAttachVariables({
    live: { KEEP: '1' },
    otherLayerArns: [],
    session: withRelay,
  })
  // Compared, never printed: a failing matcher would show the key.
  expect(attached.SLS_DEV_SESSION_KEY === withRelay.key).toBe(true)
  expect(attached.SLS_DEV_SESSION_KEY).toHaveLength(44)
  expect(attached.SLS_DEV_IOT_ENDPOINT).toBe(withRelay.iotEndpoint)
  const restored = buildRestoreVariables({
    live: attached,
    remainingLayerArns: [],
  })
  expect(restored).toEqual({ KEEP: '1' })
})

test('a function near the 4 KB limit stops fitting once the key and the endpoint are counted', () => {
  const withRelay = {
    ...session,
    key: Buffer.alloc(32, 7).toString('base64'),
    iotEndpoint: 'abcdefghijklmn-ats.iot.us-east-1.amazonaws.com',
  }
  const attachedSize = (live) =>
    envSize(buildAttachVariables({ live, otherLayerArns: [], session }))
  // Fits exactly without the relay's two variables...
  const live = { PAD: '' }
  live.PAD = 'x'.repeat(4096 - attachedSize(live))
  expect(
    fitsEnvBudget(buildAttachVariables({ live, otherLayerArns: [], session })),
  ).toBe(true)
  // ...and no longer with them.
  expect(
    fitsEnvBudget(
      buildAttachVariables({ live, otherLayerArns: [], session: withRelay }),
    ),
  ).toBe(false)
})

test('attach replaces an older Dev Mode layer instead of adding a second version', () => {
  expect(attachLayers([OLD_DEV, DASH_NODE], DEV)).toEqual([DEV, DASH_NODE])
})

test('detach removes Dev Mode layers and nothing else: a suffixed or foreign layer of that name stays', () => {
  // Built from DEV: the function and the suffixed layer are in DEV's account.
  const suffixed = DEV.replace(
    ':layer:serverless-dev-arm64:3',
    ':layer:serverless-dev-x86_64-p1abc:1',
  )
  const foreign = `arn:aws:lambda:us-east-1:${'9'.repeat(12)}:layer:serverless-dev-arm64:7`
  const fn = DEV.replace(
    ':layer:serverless-dev-arm64:3',
    ':function:svc-dev-api',
  )
  expect(detachLayers([DEV, suffixed, DASH_NODE])).toEqual([
    suffixed,
    DASH_NODE,
  ])
  expect(detachLayers([DEV, foreign, DASH_NODE], fn)).toEqual([
    foreign,
    DASH_NODE,
  ])
  // Attaching ours (in the function's account) keeps a foreign layer with the same name.
  expect(attachLayers([foreign, DASH_NODE], DEV)).toEqual([
    DEV,
    foreign,
    DASH_NODE,
  ])
  expect(isAttached({ variables: {}, layerArns: [foreign], scope: fn })).toBe(
    false,
  )
})

test('isAttached recognises every partial state', () => {
  expect(isAttached({ variables: {}, layerArns: [] })).toBe(false)
  // A function's own SLS_DEV_SESSION, without the rest of the undo record, is not Dev Mode's.
  expect(
    isAttached({ variables: { [ENV.SESSION]: 's_x' }, layerArns: [] }),
  ).toBe(false)
  expect(
    isAttached({
      variables: {
        [ENV.SESSION]: 's_x',
        [ENV.OWNER]: 'bob@desk',
        [ENV.ATTACHED_AT]: '1790000000',
      },
      layerArns: [],
    }),
  ).toBe(false)
  // The complete record Dev Mode writes (here its wrapper was replaced and its layer removed).
  expect(
    isAttached({
      variables: {
        [ENV.VERSION]: '1',
        [ENV.SESSION]: 's_x',
        [ENV.OWNER]: 'bob@desk',
        [ENV.ATTACHED_AT]: '1790000000',
        [ENV.BROKER_ROLE_ARN]: 'the broker role ARN',
        [ENV.BROKER_EXTERNAL_ID]: 'ab'.repeat(16),
      },
      layerArns: [],
    }),
  ).toBe(true)
  expect(
    isAttached({
      variables: { AWS_LAMBDA_EXEC_WRAPPER: WRAPPER_PATH },
      layerArns: [],
    }),
  ).toBe(true)
  // A layer with Dev Mode's name proves nothing: Dev Mode writes its wrapper and its record in the
  // same update as its layer, so a function it attached never has the layer alone.
  expect(isAttached({ variables: {}, layerArns: [DEV] })).toBe(false)
  expect(
    isAttached({
      variables: { [ENV.SESSION]: 's_x', [ENV.OWNER]: 'bob@desk' },
      layerArns: [DEV],
    }),
  ).toBe(false)
  expect(
    isAttached({
      variables: {
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
      },
      layerArns: [DASH_NODE],
    }),
  ).toBe(false)
})

test('readAttachment reads the owner record', () => {
  expect(readAttachment({})).toBeNull()
  expect(
    readAttachment({
      [ENV.SESSION]: 's_x',
      [ENV.OWNER]: 'bob@desk',
      [ENV.ATTACHED_AT]: '1790000000',
    }),
  ).toEqual({ session: 's_x', owner: 'bob@desk', attachedAt: 1790000000 })
  expect(readAttachment({ [ENV.SESSION]: 's_x' })).toEqual({
    session: 's_x',
    owner: 'unknown',
    attachedAt: undefined,
  })
})

test('an empty wrapper round-trips exactly', () => {
  const live = { AWS_LAMBDA_EXEC_WRAPPER: '', A: '1' }
  const { attached, restored } = roundTrip(live, [])
  expect(attached[ENV.ORIGINAL_WRAPPER]).toBe('')
  expect(attached.AWS_LAMBDA_EXEC_WRAPPER).toBe(WRAPPER_PATH)
  expect(restored).toEqual(live)
})

test('an empty wrapper survives a re-attach', () => {
  const live = { AWS_LAMBDA_EXEC_WRAPPER: '', A: '1' }
  const first = buildAttachVariables({ live, otherLayerArns: [], session })
  const again = buildAttachVariables({
    live: first,
    otherLayerArns: [],
    session: { ...session, id: testSessionId(2) },
  })
  expect(again[ENV.ORIGINAL_WRAPPER]).toBe('')
  expect(
    buildRestoreVariables({ live: again, remainingLayerArns: [] }),
  ).toEqual(live)
})

const DASH_NODE_UNVERSIONED =
  'arn:aws:lambda:us-east-1:177335420605:layer:sls-sdk-node:1'
const DASH_PYTHON =
  'arn:aws:lambda:us-east-1:177335420605:layer:sls-sdk-python-v0-9-0:1'
const DASH_PYTHON_UNVERSIONED =
  'arn:aws:lambda:us-east-1:177335420605:layer:sls-sdk-python:1'
const DASH_OTEL =
  'arn:aws:lambda:us-east-1:177335420605:layer:sls-otel-extension-node-0-4-7:1'
const DASH_OTEL_UNVERSIONED =
  'arn:aws:lambda:us-east-1:177335420605:layer:sls-otel-extension-node:1'

test.each([
  ['/opt/sls-sdk-node/exec-wrapper.sh', DASH_NODE],
  ['/opt/sls-sdk-node/exec-wrapper.sh', DASH_NODE_UNVERSIONED],
  ['/opt/sls-sdk-python/exec_wrapper.py', DASH_PYTHON],
  ['/opt/sls-sdk-python/exec_wrapper.py', DASH_PYTHON_UNVERSIONED],
  ['/opt/otel-extension-internal-node/exec-wrapper.sh', DASH_OTEL],
  ['/opt/otel-extension-internal-node/exec-wrapper.sh', DASH_OTEL_UNVERSIONED],
])('wrapper %s is provided by layer %s', (wrapper, layer) => {
  const live = { AWS_LAMBDA_EXEC_WRAPPER: wrapper }
  const { attached, restored, remaining } = roundTrip(live, [OTEL, layer])
  expect(attached[ENV.ORIGINAL_WRAPPER_LAYER]).toBe(layer)
  expect(attached[ENV.LAYERS_AT_ATTACH]).toBeUndefined()
  expect(restored).toEqual(live)
  expect(remaining).toEqual([OTEL, layer])
  // Once its layer is gone the wrapper does not come back, whatever else stays.
  expect(
    buildRestoreVariables({ live: attached, remainingLayerArns: [OTEL] }),
  ).toEqual({})
})

test('a stale Dev Mode layer does not enter the layers fingerprint', () => {
  const live = { AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-instrument' }
  const attached = buildAttachVariables({
    live,
    otherLayerArns: [OLD_DEV, OTEL],
    session,
  })
  const clean = buildAttachVariables({
    live,
    otherLayerArns: [OTEL],
    session,
  })
  expect(attached[ENV.LAYERS_AT_ATTACH]).toBe(clean[ENV.LAYERS_AT_ATTACH])
  expect(
    buildRestoreVariables({ live: attached, remainingLayerArns: [OTEL] }),
  ).toEqual(live)
})

test('a Dashboard function survives attach, a crashed re-attach and restore', () => {
  const live = {
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
    SLS_ORG_ID: 'org-1',
    SLS_DEV_MODE_ORG_ID: 'org-1',
    SLS_DEV_TOKEN: 'token',
    SLS_DEV_SOMETHING: 'the user owns this one',
    SERVERLESS_PLATFORM_STAGE: 'dev',
  }
  const liveLayers = [DASH_NODE]
  const first = buildAttachVariables({
    live,
    otherLayerArns: liveLayers,
    session,
  })
  const attachedLayers = attachLayers(liveLayers, DEV)
  // The session crashed; a new one attaches over the still-attached configuration.
  const again = buildAttachVariables({
    live: first,
    otherLayerArns: detachLayers(attachedLayers),
    session: { ...session, id: testSessionId(2) },
  })
  expect(again[ENV.SESSION]).toBe(testSessionId(2))
  expect(again[ENV.ORIGINAL_WRAPPER]).toBe('/opt/sls-sdk-node/exec-wrapper.sh')
  expect(again[ENV.ORIGINAL_WRAPPER_LAYER]).toBe(DASH_NODE)
  const remaining = detachLayers(attachLayers(attachedLayers, DEV))
  expect(remaining).toEqual(liveLayers)
  expect(
    buildRestoreVariables({ live: again, remainingLayerArns: remaining }),
  ).toEqual(live)
})

test('an unmapped /opt wrapper keeps its fingerprint across a crashed re-attach', () => {
  const live = { AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-instrument', A: '1' }
  const first = buildAttachVariables({ live, otherLayerArns: [OTEL], session })
  const again = buildAttachVariables({
    live: first,
    otherLayerArns: [OTEL],
    session: { ...session, id: testSessionId(2) },
  })
  expect(again[ENV.LAYERS_AT_ATTACH]).toMatch(/^[0-9a-f]{16}$/)
  expect(again[ENV.LAYERS_AT_ATTACH]).toBe(first[ENV.LAYERS_AT_ATTACH])
  expect(
    buildRestoreVariables({ live: again, remainingLayerArns: [OTEL] }),
  ).toEqual(live)
})

test('attach and detach keep the relative order of the other layers', () => {
  expect(attachLayers([OTEL, OLD_DEV, DASH_PYTHON, DASH_NODE], DEV)).toEqual([
    DEV,
    OTEL,
    DASH_PYTHON,
    DASH_NODE,
  ])
  expect(detachLayers([DASH_NODE, DEV, OTEL, DASH_PYTHON])).toEqual([
    DASH_NODE,
    OTEL,
    DASH_PYTHON,
  ])
})

test('no exported function mutates its inputs', () => {
  const deepFreeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(deepFreeze)
      Object.freeze(value)
    }
    return value
  }
  const live = deepFreeze({
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
    SLS_DEV_SESSION: 's_old',
    A: '1',
  })
  const layers = deepFreeze([DASH_NODE, OLD_DEV, OTEL])
  const frozenSession = deepFreeze({
    ...session,
    broker: { ...session.broker },
  })
  const config = deepFreeze({
    Environment: { Variables: live },
    Layers: layers.map((Arn) => ({ Arn })),
  })
  const snapshot = JSON.stringify({ live, layers, frozenSession, config })

  // Frozen inputs make any write throw (modules run in strict mode).
  envSize(live)
  fitsEnvBudget(live)
  variablesOf(config)
  layerArnsOf(config)
  attachLayers(layers, DEV)
  detachLayers(layers)
  layersFingerprint(layers)
  const attached = deepFreeze(
    buildAttachVariables({
      live,
      otherLayerArns: layers,
      session: frozenSession,
    }),
  )
  buildAttachVariables({
    live: attached,
    otherLayerArns: layers,
    session: frozenSession,
  })
  buildRestoreVariables({ live: attached, remainingLayerArns: layers })
  buildRestoreVariables({ live, remainingLayerArns: layers })
  readAttachment(attached)
  isAttached({ variables: attached, layerArns: layers })

  expect(JSON.stringify({ live, layers, frozenSession, config })).toBe(snapshot)
})
