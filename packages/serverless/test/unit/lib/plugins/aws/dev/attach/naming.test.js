import {
  DEVMODE_VARIABLE_NAMES,
  brokerRoleName,
  functionKeyOf,
  isDevModeLayerArn,
  isProtectedStage,
  layerName,
} from '../../../../../../../lib/plugins/aws/dev/attach/naming.js'

let savedSuffix
beforeAll(() => {
  savedSuffix = process.env.SLS_DEV_TEST_SUFFIX
  delete process.env.SLS_DEV_TEST_SUFFIX
})
afterAll(() => {
  if (savedSuffix === undefined) delete process.env.SLS_DEV_TEST_SUFFIX
  else process.env.SLS_DEV_TEST_SUFFIX = savedSuffix
})

test('Dev Mode variable names cannot collide with Dashboard variables', () => {
  for (const name of DEVMODE_VARIABLE_NAMES) {
    expect(name).toMatch(/^SLS_DEV_[A-Z_]+$/)
    // Dashboard owns the SLS_DEV_MODE_ family.
    expect(name.startsWith('SLS_DEV_MODE_')).toBe(false)
  }
  for (const taken of [
    'SLS_DEV_MODE_ORG_ID',
    'SLS_DEV_TOKEN',
    'SLS_ORG_ID',
    'SLS_DEV_PLAIN_OUTPUT',
  ]) {
    expect(DEVMODE_VARIABLE_NAMES).not.toContain(taken)
  }
  expect(DEVMODE_VARIABLE_NAMES).toEqual(
    expect.arrayContaining(['SLS_DEV_SESSION_KEY', 'SLS_DEV_IOT_ENDPOINT']),
  )
})

test('names carry the test suffix only when it is valid', () => {
  expect(layerName('arm64', {})).toBe('serverless-dev-arm64')
  expect(layerName('x86_64', { SLS_DEV_TEST_SUFFIX: 'p1abc' })).toBe(
    'serverless-dev-x86_64-p1abc',
  )
  expect(layerName('arm64', { SLS_DEV_TEST_SUFFIX: 'Bad_Suffix' })).toBe(
    'serverless-dev-arm64',
  )
  expect(brokerRoleName('us-east-1', {})).toBe(
    'serverless-dev-broker-us-east-1',
  )
  expect(
    brokerRoleName('ap-southeast-5', { SLS_DEV_TEST_SUFFIX: 'abcdefghijkl' })
      .length,
  ).toBeLessThanOrEqual(64)
})

test('isDevModeLayerArn matches only Dev Mode layers', () => {
  expect(
    isDevModeLayerArn(
      'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:3',
    ),
  ).toBe(true)
  // A suffixed name is a test layer only while that test suffix is set.
  const suffixed = `arn:aws:lambda:us-east-1:${'1'.repeat(12)}:layer:serverless-dev-x86_64-p1abc:1`
  expect(isDevModeLayerArn(suffixed, { env: {} })).toBe(false)
  expect(
    isDevModeLayerArn(suffixed, { env: { SLS_DEV_TEST_SUFFIX: 'p1abc' } }),
  ).toBe(true)
  expect(
    isDevModeLayerArn(suffixed, { env: { SLS_DEV_TEST_SUFFIX: 'p1xyz' } }),
  ).toBe(false)
  expect(
    isDevModeLayerArn(
      'arn:aws:lambda:us-east-1:177335420605:layer:sls-sdk-node-v0-15-15:1',
    ),
  ).toBe(false)
  expect(
    isDevModeLayerArn(
      'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-tools:1',
    ),
  ).toBe(false)
  expect(isDevModeLayerArn(undefined)).toBe(false)
})

test("a layer named like Dev Mode's is ours only in the function's own account and region", () => {
  const account = '1'.repeat(12)
  const other = '2'.repeat(12)
  const scope = `arn:aws:lambda:us-east-1:${account}:function:svc-dev-api`
  const layer = (acct, region = 'us-east-1') =>
    `arn:aws:lambda:${region}:${acct}:layer:serverless-dev-arm64:3`
  expect(isDevModeLayerArn(layer(account), { scope, env: {} })).toBe(true)
  expect(isDevModeLayerArn(layer(other), { scope, env: {} })).toBe(false)
  expect(
    isDevModeLayerArn(layer(account, 'eu-west-1'), { scope, env: {} }),
  ).toBe(false)
})

test.each(['prod', 'PROD', 'Production', 'production'])(
  'stage %s is protected',
  (stage) => {
    expect(isProtectedStage(stage)).toBe(true)
  },
)

test.each(['preprod', 'prod-eu', 'dev', 'alice', undefined])(
  'stage %s is not protected',
  (stage) => {
    expect(isProtectedStage(stage)).toBe(false)
  },
)

test('a deployed name turns into its function key; any other name stays as it is', () => {
  const names = { api: 'svc-dev-api', worker: 'custom-worker-name' }
  const keyOf = functionKeyOf({
    getAllFunctions: () => Object.keys(names),
    getFunction: (key) => ({ name: names[key] }),
  })
  expect(keyOf('svc-dev-api')).toBe('api')
  expect(keyOf('custom-worker-name')).toBe('worker')
  expect(keyOf('other-service-fn')).toBe('other-service-fn')
})
