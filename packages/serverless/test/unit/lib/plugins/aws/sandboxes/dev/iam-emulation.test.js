'use strict'

import { jest } from '@jest/globals'
import SandboxIamEmulation from '../../../../../../../lib/plugins/aws/sandboxes/dev/iam-emulation.js'

const ROLE_ARN = 'arn:aws:iam::123456789012:role/svc-sbx-api-exec'
const CALLER = 'arn:aws:iam::123456789012:role/Dev'
const TRUST = {
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Principal: { Service: 'lambda.amazonaws.com' },
      Action: 'sts:AssumeRole',
    },
  ],
}

// A fake provider whose `request` is routed by service+method.
function makeProvider(handlers = {}) {
  const calls = []
  const request = jest.fn(async (service, method, params) => {
    calls.push({ service, method, params })
    const key = `${service}.${method}`
    if (handlers[key]) return handlers[key](params)
    throw new Error(`unexpected request ${key}`)
  })
  return {
    request,
    getRegion: () => 'us-east-1',
    naming: { getStackName: () => 'svc-dev' },
    calls,
  }
}

function defaultHandlers(overrides = {}) {
  return {
    'CloudFormation.describeStacks': () => ({
      Stacks: [
        {
          Outputs: [
            {
              OutputKey: 'ApiImageArn',
              OutputValue: 'arn:aws:ecr:us-east-1:123456789012:repository/api',
            },
            { OutputKey: 'ApiImageExecutionRoleArn', OutputValue: ROLE_ARN },
          ],
        },
      ],
    }),
    'STS.getCallerIdentity': () => ({ Arn: CALLER }),
    'IAM.getRole': () => ({
      Role: {
        Arn: ROLE_ARN,
        MaxSessionDuration: 3600,
        AssumeRolePolicyDocument: encodeURIComponent(JSON.stringify(TRUST)),
      },
    }),
    'IAM.updateAssumeRolePolicy': () => ({}),
    'STS.assumeRole': () => ({
      Credentials: {
        AccessKeyId: 'AKIA',
        SecretAccessKey: 'SECRET',
        SessionToken: 'TOKEN',
        Expiration: new Date(Date.now() + 3600_000).toISOString(),
      },
    }),
    ...overrides,
  }
}

function make(handlers) {
  const provider = makeProvider(handlers)
  const logger = { notice: jest.fn(), warning: jest.fn(), debug: jest.fn() }
  const iam = new SandboxIamEmulation({
    provider,
    logger,
    sleep: async () => {},
  })
  return { iam, provider, logger }
}

// resolveSandboxOutputs reads the per-sandbox `<ImageLogicalId>ExecutionRoleArn` output;
// the fake above uses 'ApiImageExecutionRoleArn' for sandbox name 'api'.

test('setUp assumes the role and returns the credential env map', async () => {
  const { iam, provider } = make(defaultHandlers())
  const env = await iam.setUp('api')
  expect(env).toEqual({
    AWS_ACCESS_KEY_ID: 'AKIA',
    AWS_SECRET_ACCESS_KEY: 'SECRET',
    AWS_SESSION_TOKEN: 'TOKEN',
    AWS_REGION: 'us-east-1',
  })
  const assume = provider.calls.find(
    (c) => c.service === 'STS' && c.method === 'assumeRole',
  )
  expect(assume.params.RoleArn).toBe(ROLE_ARN)
})

test('setUp adds the SID-tagged dev principal to the trust policy', async () => {
  const { iam, provider } = make(defaultHandlers())
  await iam.setUp('api')
  const update = provider.calls.find(
    (c) => c.method === 'updateAssumeRolePolicy',
  )
  expect(update).toBeDefined()
  const doc = JSON.parse(update.params.PolicyDocument)
  const dev = doc.Statement.find(
    (s) => s.Sid === 'ServerlessSandboxesLocalDevPolicy',
  )
  expect(dev).toBeDefined()
  expect(dev.Principal.AWS).toContain(CALLER)
})

test('setUp is idempotent: does not re-update when the caller is already trusted', async () => {
  const trustWithDev = {
    Version: '2012-10-17',
    Statement: [
      ...TRUST.Statement,
      {
        Sid: 'ServerlessSandboxesLocalDevPolicy',
        Effect: 'Allow',
        Principal: { AWS: [CALLER] },
        Action: 'sts:AssumeRole',
      },
    ],
  }
  const { iam, provider } = make(
    defaultHandlers({
      'IAM.getRole': () => ({
        Role: {
          Arn: ROLE_ARN,
          MaxSessionDuration: 3600,
          AssumeRolePolicyDocument: encodeURIComponent(
            JSON.stringify(trustWithDev),
          ),
        },
      }),
    }),
  )
  await iam.setUp('api')
  expect(
    provider.calls.find((c) => c.method === 'updateAssumeRolePolicy'),
  ).toBeUndefined()
})

test('setUp resolves an SSO caller via iam:GetRole (issue #13652 path)', async () => {
  const sso =
    'arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_Admin_abc/user'
  const authoritative =
    'arn:aws:iam::123456789012:role/aws-reserved/sso.amazonaws.com/eu-central-1/AWSReservedSSO_Admin_abc'
  const handlers = defaultHandlers({
    'STS.getCallerIdentity': () => ({ Arn: sso }),
    'IAM.getRole': (params) => {
      if (params.RoleName === 'AWSReservedSSO_Admin_abc')
        return { Role: { Arn: authoritative } }
      return {
        Role: {
          Arn: ROLE_ARN,
          MaxSessionDuration: 3600,
          AssumeRolePolicyDocument: encodeURIComponent(JSON.stringify(TRUST)),
        },
      }
    },
  })
  const { iam, provider } = make(handlers)
  await iam.setUp('api')
  const update = provider.calls.find(
    (c) => c.method === 'updateAssumeRolePolicy',
  )
  const dev = JSON.parse(update.params.PolicyDocument).Statement.find(
    (s) => s.Sid === 'ServerlessSandboxesLocalDevPolicy',
  )
  expect(dev.Principal.AWS).toContain(authoritative)
})

test('setUp returns null and logs a notice when the stack output is missing (ambient fallback)', async () => {
  const { iam, logger } = make(
    defaultHandlers({
      'CloudFormation.describeStacks': () => ({ Stacks: [{ Outputs: [] }] }),
    }),
  )
  await expect(iam.setUp('api')).resolves.toBeNull()
  expect(logger.notice).toHaveBeenCalled()
})

test('setUp returns null when AssumeRole keeps failing (ambient fallback, no throw)', async () => {
  const { iam } = make(
    defaultHandlers({
      'STS.assumeRole': () => {
        throw new Error('AccessDenied')
      },
    }),
  )
  await expect(iam.setUp('api')).resolves.toBeNull()
})

test('assumeRole retries without DurationSeconds when the requested duration is rejected', async () => {
  let n = 0
  const { iam, provider } = make(
    defaultHandlers({
      'STS.assumeRole': (params) => {
        n++
        if (params.DurationSeconds !== undefined) {
          const e = new Error('DurationSeconds exceeds the MaxSessionDuration')
          e.name = 'ValidationError'
          throw e
        }
        return {
          Credentials: {
            AccessKeyId: 'A',
            SecretAccessKey: 'S',
            SessionToken: 'T',
            Expiration: new Date(Date.now() + 3600_000).toISOString(),
          },
        }
      },
    }),
  )
  const env = await iam.setUp('api')
  expect(env.AWS_ACCESS_KEY_ID).toBe('A')
  expect(n).toBe(2) // first with duration (rejected), then without
})

test('cleanUp removes the principal we added (drops the empty statement)', async () => {
  const { iam, provider } = make(defaultHandlers())
  await iam.setUp('api')
  // getRole on cleanup returns the trust policy WITH our statement present.
  const withDev = {
    Version: '2012-10-17',
    Statement: [
      ...TRUST.Statement,
      {
        Sid: 'ServerlessSandboxesLocalDevPolicy',
        Effect: 'Allow',
        Principal: { AWS: [CALLER] },
        Action: 'sts:AssumeRole',
      },
    ],
  }
  provider.request.mockImplementation(async (service, method, params) => {
    if (`${service}.${method}` === 'IAM.getRole')
      return {
        Role: {
          AssumeRolePolicyDocument: encodeURIComponent(JSON.stringify(withDev)),
        },
      }
    if (`${service}.${method}` === 'IAM.updateAssumeRolePolicy') {
      provider.calls.push({ service, method, params })
      return {}
    }
    return {}
  })
  await iam.cleanUp()
  const update = provider.calls
    .filter((c) => c.method === 'updateAssumeRolePolicy')
    .pop()
  const doc = JSON.parse(update.params.PolicyDocument)
  expect(
    doc.Statement.find((s) => s.Sid === 'ServerlessSandboxesLocalDevPolicy'),
  ).toBeUndefined()
})

test('cleanUp is a no-op (no throw) when setUp never added a principal', async () => {
  const { iam, provider } = make(defaultHandlers())
  await expect(iam.cleanUp()).resolves.toBeUndefined()
  expect(
    provider.calls.find((c) => c.method === 'updateAssumeRolePolicy'),
  ).toBeUndefined()
})

test('normalizes a single-object trust-policy Statement before mutating it', async () => {
  // IAM may return Statement as a lone object rather than an array.
  const singleStmt = {
    Version: '2012-10-17',
    Statement: {
      Effect: 'Allow',
      Principal: { Service: 'lambda.amazonaws.com' },
      Action: 'sts:AssumeRole',
    },
  }
  const { iam, provider } = make(
    defaultHandlers({
      'IAM.getRole': () => ({
        Role: {
          Arn: ROLE_ARN,
          MaxSessionDuration: 3600,
          AssumeRolePolicyDocument: encodeURIComponent(
            JSON.stringify(singleStmt),
          ),
        },
      }),
    }),
  )
  const env = await iam.setUp('api')
  expect(env).toBeTruthy() // did not throw on the object-shaped Statement
  const update = provider.calls.find(
    (c) => c.method === 'updateAssumeRolePolicy',
  )
  const doc = JSON.parse(update.params.PolicyDocument)
  expect(Array.isArray(doc.Statement)).toBe(true)
  expect(
    doc.Statement.some((s) => s.Sid === 'ServerlessSandboxesLocalDevPolicy'),
  ).toBe(true)
})
