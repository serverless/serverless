import {
  brokerPolicyState,
  buildPermissionPolicy,
  buildTrustPolicy,
  createBroker,
  getBroker,
  isNewBroker,
  identityFrom,
  policyVersionOf,
  putBrokerPolicy,
  readExternalId,
  trustIsWidened,
  trustPolicyDifferences,
  updateBrokerPolicy,
  widenBrokerTrust,
} from '../../../../../../../lib/plugins/aws/dev/attach/broker.js'
import { ACCOUNT, fakeIam } from './fakes.js'

let savedSuffix
beforeAll(() => {
  savedSuffix = process.env.SLS_DEV_TEST_SUFFIX
  delete process.env.SLS_DEV_TEST_SUFFIX
})
afterAll(() => {
  if (savedSuffix === undefined) delete process.env.SLS_DEV_TEST_SUFFIX
  else process.env.SLS_DEV_TEST_SUFFIX = savedSuffix
})

const identity = { accountId: ACCOUNT, partition: 'aws' }
const AT = { identity, region: 'us-east-1' }
const NAME = 'serverless-dev-broker-us-east-1'
// A role created with "serverless dev setup --path /serverless/".
const PATHED_ARN = `arn:aws:iam::${ACCOUNT}:role/serverless/${NAME}`
const fixedBytes = () => Buffer.alloc(16, 0xab)
const EXT = 'ab'.repeat(16)
const SOURCE = `arn:aws:lambda:us-east-1:${ACCOUNT}:function:*`

/** A role as IAM stores it, with the trust document `doc` (an object). */
const seed = (doc) => {
  const iam = fakeIam()
  iam.roles.set(NAME, {
    RoleName: NAME,
    Path: '/',
    Arn: `arn:aws:iam::${ACCOUNT}:role/${NAME}`,
    AssumeRolePolicyDocument: JSON.stringify(doc),
  })
  return iam
}
const ours = () => buildTrustPolicy({ ...AT, externalId: EXT })
const withStatement = (change) => {
  const doc = ours()
  doc.Statement[0] = change(doc.Statement[0])
  return doc
}
const writes = (iam) =>
  iam.calls.filter(([op]) => !op.startsWith('get')).map(([op]) => op)

describe('getBroker accepts the trust policy as IAM normalises it', () => {
  test.each([
    ['as written', () => ours()],
    [
      'with reordered keys and a single statement object',
      () => ({
        Statement: {
          Condition: {
            ArnLike: { 'lambda:SourceFunctionArn': SOURCE },
            StringEquals: {
              'sts:ExternalId': EXT,
              'aws:PrincipalAccount': ACCOUNT,
            },
          },
          Action: ['sts:TagSession', 'sts:AssumeRole'],
          Principal: { AWS: '*' },
          Effect: 'Allow',
          Sid: 'ServerlessDevModeBridge',
        },
        Version: '2012-10-17',
      }),
    ],
    [
      'with Principal "*" and single values as one-element arrays',
      () =>
        withStatement((s) => ({
          ...s,
          Principal: '*',
          Condition: {
            StringEquals: {
              'aws:PrincipalAccount': [ACCOUNT],
              'sts:ExternalId': [EXT],
            },
            ArnLike: { 'lambda:SourceFunctionArn': [SOURCE] },
          },
        })),
    ],
    [
      'with Principal {"AWS": ["*"]}',
      () => withStatement((s) => ({ ...s, Principal: { AWS: ['*'] } })),
    ],
    [
      'with an extra statement that only denies',
      () => {
        const doc = ours()
        doc.Statement.push({
          Effect: 'Deny',
          Principal: { AWS: '*' },
          Action: 'sts:AssumeRole',
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        })
        return doc
      },
    ],
  ])('%s', async (_, doc) => {
    const iam = seed(doc())
    expect(await getBroker({ iam, name: NAME, ...AT })).toMatchObject({
      externalId: EXT,
      created: false,
    })
  })
})

describe('getBroker refuses a broker whose trust policy was changed, and writes nothing', () => {
  test.each([
    [
      'the account condition was removed',
      () =>
        withStatement((s) => {
          delete s.Condition.StringEquals['aws:PrincipalAccount']
          return s
        }),
      'aws:PrincipalAccount',
    ],
    [
      'another account is trusted',
      () =>
        withStatement((s) => {
          s.Condition.StringEquals['aws:PrincipalAccount'] = '210987654321'
          return s
        }),
      'aws:PrincipalAccount',
    ],
    [
      'the source function pattern was widened',
      () =>
        withStatement((s) => {
          s.Condition.ArnLike['lambda:SourceFunctionArn'] = 'arn:aws:lambda:*'
          return s
        }),
      'lambda:SourceFunctionArn',
    ],
    [
      'the source function condition was removed',
      () =>
        withStatement((s) => {
          delete s.Condition.ArnLike
          return s
        }),
      'lambda:SourceFunctionArn',
    ],
    [
      'the principal was widened',
      () =>
        withStatement((s) => ({
          ...s,
          Principal: { AWS: '*', Service: 'lambda.amazonaws.com' },
        })),
      'principal',
    ],
    [
      'an action was added',
      () =>
        withStatement((s) => ({
          ...s,
          Action: [...s.Action, 'sts:AssumeRoleWithWebIdentity'],
        })),
      'actions',
    ],
    [
      'the ExternalId condition was removed',
      () =>
        withStatement((s) => {
          delete s.Condition.StringEquals['sts:ExternalId']
          return s
        }),
      'sts:ExternalId',
    ],
    ...[['sts:AssumeRole'], 'sts:*', 'sts:Tag*', '*'].map((Action) => [
      `another statement allows ${[].concat(Action).join(', ')}`,
      () => {
        const doc = ours()
        doc.Statement.push({
          Sid: 'Extra',
          Effect: 'Allow',
          Principal: { AWS: `arn:aws:iam::${ACCOUNT}:root` },
          Action,
        })
        return doc
      },
      'another statement',
    ]),
    [
      'another statement allows everything but one action',
      () => {
        const doc = ours()
        doc.Statement.push({
          Effect: 'Allow',
          Principal: '*',
          NotAction: 'iam:PassRole',
        })
        return doc
      },
      'another statement',
    ],
  ])('%s', async (_, doc, named) => {
    const iam = seed(doc())
    const error = await getBroker({ iam, name: NAME, ...AT }).catch((e) => e)
    expect(error.code).toBe('DEV_MODE_BROKER_MODIFIED')
    expect(error.message).toContain(NAME)
    expect(error.message).toContain(named)
    expect(error.message).toContain('serverless dev setup')
    expect(writes(iam)).toEqual([])
  })

  test('createBroker refuses a changed role a teammate created first', async () => {
    const iam = seed(
      withStatement((s) => ({ ...s, Principal: { AWS: '*', Federated: 'x' } })),
    )
    await expect(
      createBroker({ iam, name: NAME, ...AT, randomBytes: fixedBytes }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_BROKER_MODIFIED' })
    expect(writes(iam)).toEqual(['createRole'])
  })
})

test('a role a teammate created first gets its permission policy before it is used', async () => {
  // The teammate's CreateRole won; their PutRolePolicy has not landed (or never will).
  const iam = seed(ours())
  const broker = await createBroker({
    iam,
    name: NAME,
    ...AT,
    randomBytes: fixedBytes,
  })
  expect(broker).toMatchObject({ name: NAME, created: false })
  expect(writes(iam)).toEqual(['createRole', 'putRolePolicy'])
  expect(await brokerPolicyState({ iam, name: NAME, ...AT })).toBe('present')
  expect(iam.policies.get(`${NAME}/serverless-dev-broker`)).toEqual(
    buildPermissionPolicy(AT),
  )
})

test('a foreign role names the command to run again', async () => {
  const iam = seed({ Statement: [{ Effect: 'Allow' }] })
  await expect(
    getBroker({ iam, name: NAME, ...AT, retryCommand: 'serverless dev setup' }),
  ).rejects.toMatchObject({
    code: 'DEV_MODE_BROKER_FOREIGN',
    message: expect.stringContaining('run "serverless dev setup" again'),
  })
})

describe('permissions boundary errors', () => {
  const BOUNDARY = `arn:aws:iam::${ACCOUNT}:policy/missing`
  test.each([
    ['NoSuchEntityException', 404],
    ['InvalidInputException', 400],
    ['MalformedPolicyDocumentException', 400],
    ['ValidationError', 400],
    ['PolicyNotAttachableException', 400],
  ])('%s from CreateRole names the boundary', async (name, status) => {
    const iam = fakeIam()
    iam.createRoleError = Object.assign(new Error('bad boundary'), {
      name,
      $metadata: { httpStatusCode: status },
    })
    await expect(
      createBroker({ iam, name: NAME, ...AT, permissionsBoundary: BOUNDARY }),
    ).rejects.toMatchObject({
      code: 'DEV_MODE_BROKER_BOUNDARY_INVALID',
      message: expect.stringContaining(BOUNDARY),
    })
  })

  test('the same errors without a boundary are not blamed on one', async () => {
    const iam = fakeIam()
    iam.createRoleError = Object.assign(new Error('bad input'), {
      name: 'InvalidInputException',
    })
    await expect(
      createBroker({ iam, name: NAME, ...AT }),
    ).rejects.toMatchObject({ name: 'InvalidInputException' })
  })

  test('expired credentials on CreateRole with a boundary are reported as such', async () => {
    const iam = fakeIam()
    iam.createRoleError = Object.assign(new Error('expired'), {
      name: 'ExpiredTokenException',
      $metadata: { httpStatusCode: 403 },
    })
    await expect(
      createBroker({ iam, name: NAME, ...AT, permissionsBoundary: BOUNDARY }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_AWS_CREDENTIALS_INVALID' })
  })
})

test('identityFrom reads the partition from the caller ARN', () => {
  expect(
    identityFrom({
      accountId: ACCOUNT,
      callerArn: 'arn:aws-us-gov:sts::1:assumed-role/x/y',
    }),
  ).toEqual({ accountId: ACCOUNT, partition: 'aws-us-gov' })
  expect(identityFrom({ accountId: ACCOUNT })).toEqual({
    accountId: ACCOUNT,
    partition: 'aws',
  })
})

test('the trust policy is the one verified live: any Lambda function of this account and region that knows the ExternalId', () => {
  // The form earlier releases wrote; `web` (the default) adds web functions to the source patterns.
  expect(
    buildTrustPolicy({
      identity,
      region: 'us-east-1',
      externalId: 'ext',
      web: false,
    }),
  ).toEqual({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'ServerlessDevModeBridge',
        Effect: 'Allow',
        Principal: { AWS: '*' },
        Action: ['sts:AssumeRole', 'sts:TagSession'],
        Condition: {
          StringEquals: {
            'aws:PrincipalAccount': ACCOUNT,
            'sts:ExternalId': 'ext',
          },
          ArnLike: {
            'lambda:SourceFunctionArn': `arn:aws:lambda:us-east-1:${ACCOUNT}:function:*`,
          },
        },
      },
    ],
  })
})

test('the permission policy allows only what a bridge does, whoever assumes the role', () => {
  // The exact document probed live: without a session policy, a client with these permissions
  // cannot connect as a session's CLI, subscribe to or receive the up topic, or publish on down,
  // gone or ping.
  const iot = `arn:aws:iot:us-east-1:${ACCOUNT}`
  expect(buildPermissionPolicy({ identity, region: 'us-east-1' })).toEqual({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'DevModeBrokerV2Connect',
        Effect: 'Allow',
        Action: 'iot:Connect',
        Resource: `${iot}:client/sls-dev-*`,
      },
      {
        Sid: 'DevModeBrokerV2NoCliClientId',
        Effect: 'Deny',
        Action: 'iot:Connect',
        Resource: `${iot}:client/sls-dev-*-cli`,
      },
      {
        Sid: 'DevModeBrokerV2PublishUp',
        Effect: 'Allow',
        Action: 'iot:Publish',
        Resource: `${iot}:topic/sls-dev/*/up`,
      },
      {
        Sid: 'DevModeBrokerV2SubscribeDownGone',
        Effect: 'Allow',
        Action: 'iot:Subscribe',
        Resource: [
          `${iot}:topicfilter/sls-dev/*/down/*`,
          `${iot}:topicfilter/sls-dev/*/gone`,
        ],
      },
      {
        Sid: 'DevModeBrokerV2ReceiveDownGone',
        Effect: 'Allow',
        Action: 'iot:Receive',
        Resource: [
          `${iot}:topic/sls-dev/*/down/*`,
          `${iot}:topic/sls-dev/*/gone`,
        ],
      },
      {
        Sid: 'DevModeBrokerV2PingCli',
        Effect: 'Allow',
        Action: 'iot:SendDirectMessage',
        Resource: `${iot}:client/sls-dev-*-cli`,
        Condition: { StringLike: { 'iot:Topic': 'sls-dev/*/ping' } },
      },
      {
        Sid: 'DevModeBrokerV2InvokeFallback',
        Effect: 'Allow',
        Action: 'lambda:InvokeWebFunctionEndpoint',
        Resource: `arn:aws:lambda:us-east-1:${ACCOUNT}:web-function/*/endpoint/sls-dev-fallback`,
      },
    ],
  })
})

test('the permission policy names the caller partition', () => {
  const doc = buildPermissionPolicy({
    identity: { accountId: ACCOUNT, partition: 'aws-cn' },
    region: 'cn-north-1',
  })
  expect(
    doc.Statement.flatMap((s) => [].concat(s.Resource)).every(
      (r) =>
        r.startsWith(`arn:aws-cn:iot:cn-north-1:${ACCOUNT}:`) ||
        r.startsWith(`arn:aws-cn:lambda:cn-north-1:${ACCOUNT}:`),
    ),
  ).toBe(true)
})

test('readExternalId reads URL-encoded and plain trust documents', () => {
  const doc = JSON.stringify(
    buildTrustPolicy({ identity, region: 'us-east-1', externalId: 'ext-1' }),
  )
  expect(
    readExternalId({ AssumeRolePolicyDocument: encodeURIComponent(doc) }),
  ).toBe('ext-1')
  expect(readExternalId({ AssumeRolePolicyDocument: doc })).toBe('ext-1')
  expect(
    readExternalId({
      AssumeRolePolicyDocument: encodeURIComponent('{"Statement":[]}'),
    }),
  ).toBeNull()
})

test('getBroker returns null when the role does not exist yet', async () => {
  expect(await getBroker({ iam: fakeIam(), name: NAME, ...AT })).toBeNull()
})

test('createBroker writes the trust policy once and the current permission policy, and reads nothing else', async () => {
  const iam = fakeIam()
  const broker = await createBroker({
    iam,
    name: NAME,
    identity,
    region: 'us-east-1',
    randomBytes: fixedBytes,
  })
  expect(broker).toEqual({
    name: NAME,
    arn: `arn:aws:iam::${ACCOUNT}:role/${NAME}`,
    externalId: 'ab'.repeat(16),
    path: '/',
    created: true,
    widened: true,
  })
  expect(iam.policies.has(`${NAME}/serverless-dev-broker`)).toBe(true)
  // A role created now has no earlier policy to look for.
  expect(iam.calls.map(([op]) => op)).toEqual(['createRole', 'putRolePolicy'])
  expect(await getBroker({ iam, name: NAME, ...AT })).toEqual({
    ...broker,
    created: false,
  })
})

test('getBroker returns when the role was created, as IAM reports it', async () => {
  const iam = fakeIam()
  await createBroker({
    iam,
    name: NAME,
    identity,
    region: 'us-east-1',
    randomBytes: fixedBytes,
  })
  iam.roles.get(NAME).CreateDate = new Date('2026-10-05T10:40:00Z')
  expect(
    (await getBroker({ iam, name: NAME, ...AT })).createdAt.toISOString(),
  ).toBe('2026-10-05T10:40:00.000Z')
})

test('isNewBroker: a role created now, or less than 3 minutes ago, may not work yet', () => {
  const at = Date.parse('2026-10-05T10:43:00Z')
  expect(isNewBroker({ created: true }, at)).toBe(true)
  expect(isNewBroker({ createdAt: new Date('2026-10-05T10:40:01Z') }, at)).toBe(
    true,
  )
  expect(isNewBroker({ createdAt: new Date('2026-10-05T10:40:00Z') }, at)).toBe(
    false,
  )
  expect(isNewBroker({ created: false }, at)).toBe(false)
  expect(isNewBroker(null, at)).toBe(false)
})

test('createBroker passes a permissions boundary and a path when given', async () => {
  const iam = fakeIam()
  const broker = await createBroker({
    iam,
    name: NAME,
    identity,
    region: 'us-east-1',
    permissionsBoundary: 'arn:aws:iam::aws:policy/PowerUserAccess',
    path: '/serverless/',
    randomBytes: fixedBytes,
  })
  expect(broker.arn).toBe(`arn:aws:iam::${ACCOUNT}:role/serverless/${NAME}`)
  expect(iam.roles.get(NAME).PermissionsBoundary).toEqual({
    PermissionsBoundaryArn: 'arn:aws:iam::aws:policy/PowerUserAccess',
  })
})

test('a teammate creating the role at the same moment is not an error', async () => {
  const iam = fakeIam()
  await createBroker({
    iam,
    name: NAME,
    identity,
    region: 'us-east-1',
    randomBytes: fixedBytes,
  })
  const again = await createBroker({
    iam,
    name: NAME,
    identity,
    region: 'us-east-1',
    randomBytes: () => Buffer.alloc(16, 1),
  })
  expect(again.externalId).toBe('ab'.repeat(16))
})

test('a denied CreateRole names the role with its path and explains dev setup', async () => {
  const iam = fakeIam()
  iam.createRoleError = Object.assign(
    new Error('not authorized to perform: iam:CreateRole'),
    { name: 'AccessDenied' },
  )
  await expect(
    createBroker({
      iam,
      name: NAME,
      identity,
      region: 'us-east-1',
      path: '/serverless/',
    }),
  ).rejects.toMatchObject({
    code: 'DEV_MODE_BROKER_CREATE_DENIED',
    message:
      `Dev Mode could not create the IAM role arn:aws:iam::${ACCOUNT}:role/serverless/${NAME} (not authorized to perform: iam:CreateRole).\n` +
      'The first "serverless dev" in an AWS account and region creates this role once; that needs iam:GetRole, iam:CreateRole and iam:PutRolePolicy on it.\n' +
      'Ask an administrator to run "serverless dev setup --region us-east-1" once (it accepts --permissions-boundary and --path when your organization requires them).',
  })
})

test('a denied GetRole names the permission on the role under any IAM path', async () => {
  const iam = fakeIam()
  iam.getRoleError = Object.assign(
    new Error('not authorized to perform: iam:GetRole'),
    { name: 'AccessDenied' },
  )
  await expect(getBroker({ iam, name: NAME, ...AT })).rejects.toMatchObject({
    code: 'DEV_MODE_BROKER_READ_DENIED',
    message: `Dev Mode needs iam:GetRole on the IAM role "${NAME}" to read its settings (not authorized to perform: iam:GetRole). Ask your AWS administrator to allow it on arn:aws:iam::${ACCOUNT}:role/*serverless-dev-broker-*, which covers the role under any IAM path.`,
  })
})

test('identityFrom refuses an account id it cannot put in a trust policy', () => {
  expect(() => identityFrom({ accountId: undefined })).toThrow(
    expect.objectContaining({ code: 'DEV_MODE_AWS_IDENTITY_UNKNOWN' }),
  )
})

test('expired credentials are reported as such, not as a missing permission', async () => {
  const iam = fakeIam()
  iam.getRoleError = Object.assign(new Error('The security token expired'), {
    name: 'ExpiredTokenException',
    $metadata: { httpStatusCode: 403 },
  })
  await expect(getBroker({ iam, name: NAME, ...AT })).rejects.toMatchObject({
    code: 'DEV_MODE_AWS_CREDENTIALS_INVALID',
  })
})

test('a role with the same name that Dev Mode did not create is refused', async () => {
  const iam = fakeIam()
  iam.roles.set(NAME, {
    RoleName: NAME,
    Path: '/',
    Arn: `arn:aws:iam::${ACCOUNT}:role/${NAME}`,
    AssumeRolePolicyDocument: '{"Statement":[{"Effect":"Allow"}]}',
  })
  await expect(getBroker({ iam, name: NAME, ...AT })).rejects.toMatchObject({
    code: 'DEV_MODE_BROKER_FOREIGN',
  })
})

describe('the permission policy carries its version in its statement ids', () => {
  test('every Sid is DevModeBroker, the version and a name, letters and digits only', () => {
    const sids = buildPermissionPolicy(AT).Statement.map((s) => s.Sid)
    expect(sids).toEqual([
      'DevModeBrokerV2Connect',
      'DevModeBrokerV2NoCliClientId',
      'DevModeBrokerV2PublishUp',
      'DevModeBrokerV2SubscribeDownGone',
      'DevModeBrokerV2ReceiveDownGone',
      'DevModeBrokerV2PingCli',
      'DevModeBrokerV2InvokeFallback',
    ])
    expect(sids.every((sid) => /^[A-Za-z0-9]+$/.test(sid))).toBe(true)
    expect(buildPermissionPolicy({ ...AT, version: 7 }).Statement[0].Sid).toBe(
      'DevModeBrokerV7Connect',
    )
  })

  test('policyVersionOf reads the highest version any statement id carries, from its prefix only', () => {
    expect(policyVersionOf(buildPermissionPolicy(AT))).toBe(2)
    expect(policyVersionOf(buildPermissionPolicy({ ...AT, version: 12 }))).toBe(
      12,
    )
    // Mixed markers: the highest counts, so a later version is never taken for an older one.
    const mixed = buildPermissionPolicy(AT)
    mixed.Statement[1].Sid = 'DevModeBrokerV3NoCliClientId'
    expect(policyVersionOf(mixed)).toBe(3)
    // Digits in the rest of a statement id are the statement's name, not the version.
    const digits = buildPermissionPolicy({ ...AT, version: 3 })
    digits.Statement.push({
      ...digits.Statement[0],
      Sid: 'DevModeBrokerV3S3Get',
    })
    digits.Statement[0].Sid = 'DevModeBrokerV3Connect2'
    expect(policyVersionOf(digits)).toBe(3)
    // A statement without the marker does not hide the others'.
    const foreign = buildPermissionPolicy(AT)
    foreign.Statement[0].Sid = 'Connect'
    expect(policyVersionOf(foreign)).toBe(2)
    const none = buildPermissionPolicy(AT)
    for (const statement of none.Statement) statement.Sid = 'Connect'
    expect(policyVersionOf(none)).toBeNull()
    const noName = buildPermissionPolicy(AT)
    for (const statement of noName.Statement) statement.Sid = 'DevModeBrokerV4'
    expect(policyVersionOf(noName)).toBeNull()
    expect(policyVersionOf({ Statement: [] })).toBeNull()
    expect(policyVersionOf(null)).toBeNull()
  })

  test('a policy with any marker above this version is newer and left as it is', async () => {
    const iam = seed(ours())
    const theirs = buildPermissionPolicy(AT)
    theirs.Statement.push({
      ...theirs.Statement[2],
      Sid: 'DevModeBrokerV3S3Get',
    })
    iam.policies.set(`${NAME}/serverless-dev-broker`, theirs)
    expect(await brokerPolicyState({ iam, name: NAME, ...AT })).toBe('newer')
    expect(await updateBrokerPolicy({ iam, name: NAME, ...AT })).toBe(false)
    expect(iam.policies.get(`${NAME}/serverless-dev-broker`)).toEqual(theirs)
  })

  test("a session racing a teammate's creation without iam:GetRolePolicy takes their policy to be in place", async () => {
    const iam = seed(ours())
    iam.getRolePolicyError = Object.assign(
      new Error('not authorized to perform: iam:GetRolePolicy'),
      { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
    )
    const broker = await createBroker({
      iam,
      name: NAME,
      ...AT,
      randomBytes: fixedBytes,
    })
    expect(broker).toMatchObject({ created: false })
    expect(writes(iam)).toEqual(['createRole'])
    // dev setup asks to stop instead.
    await expect(
      createBroker({
        iam,
        name: NAME,
        ...AT,
        randomBytes: fixedBytes,
        unreadablePolicy: 'stop',
      }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_BROKER_READ_DENIED' })
  })

  test("a teammate's role under an IAM path is named by its ARN when its policy cannot be read", async () => {
    const iam = seed(ours())
    Object.assign(iam.roles.get(NAME), {
      Path: '/serverless/',
      Arn: PATHED_ARN,
    })
    iam.getRolePolicyError = Object.assign(
      new Error('not authorized to perform: iam:GetRolePolicy'),
      { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
    )
    await expect(
      createBroker({
        iam,
        name: NAME,
        ...AT,
        randomBytes: fixedBytes,
        unreadablePolicy: 'stop',
      }),
    ).rejects.toMatchObject({
      code: 'DEV_MODE_BROKER_READ_DENIED',
      message: expect.stringContaining(
        `iam:GetRolePolicy on the IAM role ${PATHED_ARN} `,
      ),
    })
  })

  test('updateBrokerPolicy writes nothing when IAM will not say what the policy is', async () => {
    const iam = seed(ours())
    iam.getRolePolicyError = Object.assign(
      new Error('not authorized to perform: iam:GetRolePolicy'),
      { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
    )
    const error = await updateBrokerPolicy({
      iam,
      name: NAME,
      ...AT,
      arn: PATHED_ARN,
    }).catch((e) => e)
    expect(error.code).toBe('DEV_MODE_BROKER_READ_DENIED')
    expect(error.message).toBe(
      `Dev Mode needs iam:GetRolePolicy on the IAM role ${PATHED_ARN} to read its permission policy serverless-dev-broker before it writes one (not authorized to perform: iam:GetRolePolicy): a newer version of Dev Mode may have written it, and Dev Mode never replaces a newer one. Ask your AWS administrator to allow it.`,
    )
    expect(writes(iam)).toEqual([])
  })
})

describe('brokerPolicyState', () => {
  // IAM's answer: the decoded document of the role's inline policy, or null.
  const holding = (doc) => ({
    getRolePolicy: async () => (doc ? JSON.stringify(doc) : null),
  })
  const state = (iam) => brokerPolicyState({ iam, name: NAME, ...AT })
  // The content earlier builds wrote under another name: no version marker.
  const WIDE = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'PublishReceive',
        Effect: 'Allow',
        Action: ['iot:Publish', 'iot:Receive'],
        Resource: `arn:aws:iot:us-east-1:${ACCOUNT}:topic/sls-dev/*`,
      },
    ],
  }

  test('present: this version, as this version writes it', async () => {
    expect(await state(holding(buildPermissionPolicy(AT)))).toBe('present')
  })

  test('missing: no policy of that name', async () => {
    expect(await state(holding(null))).toBe('missing')
  })

  test('outdated: an older version', async () => {
    expect(
      await state(holding(buildPermissionPolicy({ ...AT, version: 0 }))),
    ).toBe('outdated')
  })

  test('outdated: this version, but changed', async () => {
    const changes = [
      (d) => d.Statement.splice(1, 1),
      (d) => (d.Statement[2].Resource = `${d.Statement[2].Resource}*`),
      (d) => delete d.Statement[5].Condition,
      (d) => (d.Statement[1].Effect = 'Allow'),
    ]
    for (const change of changes) {
      const changed = buildPermissionPolicy(AT)
      change(changed)
      expect(await state(holding(changed))).toBe('outdated')
    }
  })

  test('outdated: a policy under that name without the version marker, or one that does not parse', async () => {
    expect(await state(holding(WIDE))).toBe('outdated')
    expect(
      await state({ getRolePolicy: async () => 'not a policy document' }),
    ).toBe('outdated')
  })

  test('newer: a later version wrote it, and it is left as it is', async () => {
    expect(
      await state(holding(buildPermissionPolicy({ ...AT, version: 9 }))),
    ).toBe('newer')
  })

  test('the content is compared as IAM means it, not as text', async () => {
    const doc = buildPermissionPolicy(AT)
    // One-element lists as strings, statements and keys in another order.
    const same = {
      Statement: doc.Statement.map((statement) =>
        Object.fromEntries(
          Object.entries(statement)
            .reverse()
            .map(([key, value]) => [
              key,
              Array.isArray(value) && value.length === 1 ? value[0] : value,
            ]),
        ),
      ).reverse(),
      Version: doc.Version,
    }
    same.Statement[0].Resource = [].concat(same.Statement[0].Resource)
    expect(await state(holding(same))).toBe('present')
  })

  test('unknown when IAM will not say', async () => {
    const denied = Object.assign(
      new Error('not authorized to perform: iam:GetRolePolicy'),
      { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
    )
    expect(
      await state({
        getRolePolicy: async () => {
          throw denied
        },
      }),
    ).toBe('unknown')
  })

  test('it asks for the one policy, by its fixed name', async () => {
    const asked = []
    await state({
      getRolePolicy: async (...args) => {
        asked.push(args)
        return null
      },
    })
    expect(asked).toEqual([[NAME, 'serverless-dev-broker']])
  })

  test('rejected credentials are an error, not "unknown"', async () => {
    const expired = Object.assign(new Error('expired'), {
      name: 'ExpiredTokenException',
    })
    await expect(
      state({
        getRolePolicy: async () => {
          throw expired
        },
      }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_AWS_CREDENTIALS_INVALID' })
  })

  test('any other error passes through', async () => {
    const boom = Object.assign(new Error('boom'), { name: 'ServiceFailure' })
    await expect(
      state({
        getRolePolicy: async () => {
          throw boom
        },
      }),
    ).rejects.toBe(boom)
  })
})

describe('putBrokerPolicy', () => {
  test('writes this version under the fixed name, over whatever is there', async () => {
    const iam = seed(ours())
    iam.policies.set(
      `${NAME}/serverless-dev-broker`,
      buildPermissionPolicy({ ...AT, version: 0 }),
    )
    await putBrokerPolicy({ iam, name: NAME, ...AT })
    expect(writes(iam)).toEqual(['putRolePolicy'])
    expect([...iam.policies.keys()]).toEqual([`${NAME}/serverless-dev-broker`])
    expect(iam.policies.get(`${NAME}/serverless-dev-broker`)).toEqual(
      buildPermissionPolicy(AT),
    )
  })

  test('a denied write names the one permission it needs', async () => {
    const iam = seed(ours())
    iam.putRolePolicyError = Object.assign(
      new Error('not authorized to perform: iam:PutRolePolicy'),
      { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
    )
    const error = await putBrokerPolicy({
      iam,
      name: NAME,
      ...AT,
      arn: PATHED_ARN,
    }).catch((e) => e)
    expect(error.code).toBe('DEV_MODE_BROKER_CREATE_DENIED')
    expect(error.message).toBe(
      `Dev Mode could not put the permission policy serverless-dev-broker on the IAM role ${PATHED_ARN} (not authorized to perform: iam:PutRolePolicy).\n` +
        'That needs iam:PutRolePolicy on the role.\n' +
        'Ask an administrator to run "serverless dev setup --region us-east-1" once (it accepts --permissions-boundary and --path when your organization requires them).',
    )
  })

  test('a role a teammate created first gets this version, unless theirs is newer', async () => {
    const older = seed(ours())
    older.policies.set(
      `${NAME}/serverless-dev-broker`,
      buildPermissionPolicy({ ...AT, version: 0 }),
    )
    await createBroker({
      iam: older,
      name: NAME,
      ...AT,
      randomBytes: fixedBytes,
    })
    expect(older.policies.get(`${NAME}/serverless-dev-broker`)).toEqual(
      buildPermissionPolicy(AT),
    )
    const newer = seed(ours())
    const theirs = buildPermissionPolicy({ ...AT, version: 3 })
    newer.policies.set(`${NAME}/serverless-dev-broker`, theirs)
    const broker = await createBroker({
      iam: newer,
      name: NAME,
      ...AT,
      randomBytes: fixedBytes,
    })
    expect(broker).toMatchObject({ created: false })
    expect(writes(newer)).toEqual(['createRole'])
    expect(newer.policies.get(`${NAME}/serverless-dev-broker`)).toEqual(theirs)
  })
})

describe('web apps: the trust policy also lets Lambda web functions assume the role', () => {
  const WEB = `arn:aws:lambda:us-east-1:${ACCOUNT}:web-function/*`
  const narrow = () => buildTrustPolicy({ ...AT, externalId: EXT, web: false })
  const role = (doc) => ({
    AssumeRolePolicyDocument: encodeURIComponent(JSON.stringify(doc)),
  })

  test('trust policy lists function and web-function patterns', () => {
    expect(
      buildTrustPolicy({ ...AT, externalId: EXT }).Statement[0].Condition
        .ArnLike,
    ).toEqual({ 'lambda:SourceFunctionArn': [SOURCE, WEB] })
    expect(narrow().Statement[0].Condition.ArnLike).toEqual({
      'lambda:SourceFunctionArn': SOURCE,
    })
    expect(
      buildTrustPolicy({
        identity: { accountId: ACCOUNT, partition: 'aws-cn' },
        region: 'cn-north-1',
        externalId: EXT,
      }).Statement[0].Condition.ArnLike['lambda:SourceFunctionArn'],
    ).toEqual([
      `arn:aws-cn:lambda:cn-north-1:${ACCOUNT}:function:*`,
      `arn:aws-cn:lambda:cn-north-1:${ACCOUNT}:web-function/*`,
    ])
  })

  test('narrow and widened trust both pass trustPolicyDifferences', async () => {
    const widened = buildTrustPolicy({ ...AT, externalId: EXT })
    // IAM may return the list in any order.
    const reordered = withStatement((s) => {
      s.Condition.ArnLike['lambda:SourceFunctionArn'] = [WEB, SOURCE]
      return s
    })
    for (const doc of [narrow(), widened, reordered]) {
      expect(trustPolicyDifferences({ role: role(doc), ...AT })).toEqual([])
    }
    expect(trustIsWidened(role(narrow()))).toBe(false)
    expect(trustIsWidened(role(widened))).toBe(true)
    expect(trustIsWidened(role(reordered))).toBe(true)
    expect(
      await getBroker({ iam: seed(narrow()), name: NAME, ...AT }),
    ).toMatchObject({ externalId: EXT, widened: false })
    expect(
      await getBroker({ iam: seed(widened), name: NAME, ...AT }),
    ).toMatchObject({ externalId: EXT, widened: true })
  })

  test('a third ArnLike value is still refused', async () => {
    for (const values of [
      [SOURCE, WEB, `arn:aws:lambda:us-east-1:${ACCOUNT}:other/*`],
      [WEB],
      [SOURCE, `arn:aws:lambda:us-east-1:210987654321:web-function/*`],
    ]) {
      const iam = seed(
        withStatement((s) => {
          s.Condition.ArnLike['lambda:SourceFunctionArn'] = values
          return s
        }),
      )
      const error = await getBroker({ iam, name: NAME, ...AT }).catch((e) => e)
      expect(error.code).toBe('DEV_MODE_BROKER_MODIFIED')
      expect(error.message).toContain('lambda:SourceFunctionArn')
      expect(writes(iam)).toEqual([])
    }
  })

  test('createBroker writes the widened trust', async () => {
    const iam = fakeIam()
    const broker = await createBroker({
      iam,
      name: NAME,
      ...AT,
      randomBytes: fixedBytes,
    })
    expect(broker.widened).toBe(true)
    expect(JSON.parse(iam.roles.get(NAME).AssumeRolePolicyDocument)).toEqual(
      buildTrustPolicy({ ...AT, externalId: EXT }),
    )
  })

  test('widenBrokerTrust writes the widened trust with the same ExternalId', async () => {
    const iam = seed(narrow())
    await widenBrokerTrust({ iam, name: NAME, ...AT, externalId: EXT })
    expect(writes(iam)).toEqual(['updateAssumeRolePolicy'])
    expect(JSON.parse(iam.roles.get(NAME).AssumeRolePolicyDocument)).toEqual(
      buildTrustPolicy({ ...AT, externalId: EXT }),
    )
    expect(await getBroker({ iam, name: NAME, ...AT })).toMatchObject({
      externalId: EXT,
      widened: true,
    })
  })

  test('widenBrokerTrust rewrites only its own statement and keeps the deny statements an administrator added', async () => {
    const deny = {
      Effect: 'Deny',
      Principal: { AWS: '*' },
      Action: 'sts:AssumeRole',
      Condition: { Bool: { 'aws:SecureTransport': 'false' } },
    }
    const doc = narrow()
    doc.Statement.push(deny)
    const iam = seed(doc)
    await widenBrokerTrust({ iam, name: NAME, ...AT, externalId: EXT })
    expect(
      JSON.parse(iam.roles.get(NAME).AssumeRolePolicyDocument).Statement,
    ).toEqual([buildTrustPolicy({ ...AT, externalId: EXT }).Statement[0], deny])
    expect(await getBroker({ iam, name: NAME, ...AT })).toMatchObject({
      widened: true,
    })
  })

  test('widen AccessDenied throws DEV_MODE_BROKER_UPDATE_DENIED with the exact message', async () => {
    const iam = seed(narrow())
    iam.updateAssumeRolePolicyError = Object.assign(
      new Error('not authorized to perform: iam:UpdateAssumeRolePolicy'),
      { name: 'AccessDenied' },
    )
    await expect(
      widenBrokerTrust({ iam, name: NAME, ...AT, externalId: EXT }),
    ).rejects.toMatchObject({
      code: 'DEV_MODE_BROKER_UPDATE_DENIED',
      message: `Dev Mode needs to let web apps use the IAM role ${NAME}, and your credentials can't update its trust policy (iam:UpdateAssumeRolePolicy). Ask an administrator to run "serverless dev setup --region us-east-1".`,
    })
  })

  test('widen with expired credentials is reported as such', async () => {
    const iam = seed(narrow())
    iam.updateAssumeRolePolicyError = Object.assign(
      new Error('The security token expired'),
      { name: 'ExpiredTokenException', $metadata: { httpStatusCode: 403 } },
    )
    await expect(
      widenBrokerTrust({ iam, name: NAME, ...AT, externalId: EXT }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_AWS_CREDENTIALS_INVALID' })
  })

  test('the permission policy lets a bridge invoke the Dev Mode endpoints of web functions', () => {
    expect(
      buildPermissionPolicy(AT).Statement.find(
        (s) => s.Sid === 'DevModeBrokerV2InvokeFallback',
      ),
    ).toEqual({
      Sid: 'DevModeBrokerV2InvokeFallback',
      Effect: 'Allow',
      Action: 'lambda:InvokeWebFunctionEndpoint',
      Resource: `arn:aws:lambda:us-east-1:${ACCOUNT}:web-function/*/endpoint/sls-dev-fallback`,
    })
    // Version 1 is the policy as version 1 wrote it: without the web function endpoint.
    expect(
      buildPermissionPolicy({ ...AT, version: 1 }).Statement.map((s) => s.Sid),
    ).toEqual([
      'DevModeBrokerV1Connect',
      'DevModeBrokerV1NoCliClientId',
      'DevModeBrokerV1PublishUp',
      'DevModeBrokerV1SubscribeDownGone',
      'DevModeBrokerV1ReceiveDownGone',
      'DevModeBrokerV1PingCli',
    ])
  })
})
