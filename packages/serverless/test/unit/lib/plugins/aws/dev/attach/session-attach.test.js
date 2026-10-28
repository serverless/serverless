import { ensureAccountSetup } from '../../../../../../../lib/plugins/aws/dev/attach/session-attach.js'
import {
  brokerPolicyState,
  buildPermissionPolicy,
  buildTrustPolicy,
  getBroker,
} from '../../../../../../../lib/plugins/aws/dev/attach/broker.js'
import { ACCOUNT, fakeIam } from './fakes.js'

const identity = { accountId: ACCOUNT, partition: 'aws' }
const region = 'us-east-1'
const AT = { identity, region }
const NAME = 'serverless-dev-broker-us-east-1'
const EXT = 'ab'.repeat(16)
const POLICY = `${NAME}/serverless-dev-broker`

/** A role an earlier release created: the trust lists functions only. */
const narrowRole = () => {
  const iam = fakeIam()
  iam.roles.set(NAME, {
    RoleName: NAME,
    Path: '/',
    Arn: `arn:aws:iam::${ACCOUNT}:role/${NAME}`,
    AssumeRolePolicyDocument: JSON.stringify(
      buildTrustPolicy({ ...AT, externalId: EXT, web: false }),
    ),
  })
  iam.policies.set(POLICY, buildPermissionPolicy(AT))
  return iam
}
const fakeLogger = () => {
  const notices = []
  return { notices, notice: (text) => notices.push(text) }
}
const fakeMain = () => {
  const notices = []
  return { notices, notice: (text) => notices.push(text) }
}
const writes = (iam) =>
  iam.calls.filter(([op]) => !op.startsWith('get')).map(([op]) => op)

const setup = async (iam, { webApps, brokerPolicy = 'present' } = {}) => {
  const broker = await getBroker({ iam, name: NAME, ...AT })
  iam.calls.length = 0
  const main = fakeMain()
  const logger = fakeLogger()
  const result = await ensureAccountSetup({
    broker,
    brokerPolicy,
    brokerName: NAME,
    ...AT,
    clients: { iam },
    main,
    logger,
    session: {},
    ...(webApps !== undefined && { webApps }),
  })
  return { ...result, main, logger }
}
const denied = (action) =>
  Object.assign(new Error(`not authorized to perform: ${action}`), {
    name: 'AccessDenied',
  })
/** A role an earlier release set up, whose policy this caller may not update. */
const v1Denied = () => {
  const iam = narrowRole()
  iam.policies.set(POLICY, buildPermissionPolicy({ ...AT, version: 1 }))
  iam.putRolePolicyError = denied('iam:PutRolePolicy')
  return iam
}

describe('ensureAccountSetup and web apps', () => {
  test('functions-only session leaves a narrow role unchanged', async () => {
    for (const webApps of [undefined, false]) {
      const iam = narrowRole()
      const { broker, main } = await setup(iam, { webApps })
      expect(writes(iam)).toEqual([])
      expect(broker.widened).toBe(false)
      expect(main.notices).toEqual([])
    }
  })

  test('web-app session widens a narrow role once', async () => {
    const iam = narrowRole()
    const first = await setup(iam, { webApps: true })
    expect(writes(iam)).toEqual(['updateAssumeRolePolicy'])
    expect(first.broker).toMatchObject({ externalId: EXT, widened: true })
    expect(first.main.notices).toEqual([`Updating IAM role ${NAME}`])
    expect(JSON.parse(iam.roles.get(NAME).AssumeRolePolicyDocument)).toEqual(
      buildTrustPolicy({ ...AT, externalId: EXT }),
    )
    // The next web-app session finds it widened.
    const second = await setup(iam, { webApps: true })
    expect(writes(iam)).toEqual([])
    expect(second.broker.widened).toBe(true)
  })

  test('a web-app session creates the role widened', async () => {
    const iam = fakeIam()
    const session = {}
    const { broker } = await ensureAccountSetup({
      broker: null,
      brokerPolicy: 'missing',
      brokerName: NAME,
      ...AT,
      clients: { iam },
      main: fakeMain(),
      session,
      webApps: true,
    })
    expect(broker).toMatchObject({ created: true, widened: true })
    expect(session.broker).toBe(broker)
    expect(iam.calls.map(([op]) => op)).not.toContain('updateAssumeRolePolicy')
  })

  test('a functions-only session creates the role with the trust earlier releases write', async () => {
    // Teammates on a CLI from before web apps keep using a role a functions-only session created.
    const iam = fakeIam()
    const { broker } = await ensureAccountSetup({
      broker: null,
      brokerPolicy: 'missing',
      brokerName: NAME,
      ...AT,
      clients: { iam },
      main: fakeMain(),
      session: {},
    })
    expect(broker).toMatchObject({ created: true, widened: false })
    expect(JSON.parse(iam.roles.get(NAME).AssumeRolePolicyDocument)).toEqual(
      buildTrustPolicy({ ...AT, externalId: broker.externalId, web: false }),
    )
  })

  test('policy V1 reads as outdated and is repaired to V2 with the fallback statement', async () => {
    const iam = narrowRole()
    iam.policies.set(POLICY, buildPermissionPolicy({ ...AT, version: 1 }))
    const brokerPolicy = await brokerPolicyState({ iam, name: NAME, ...AT })
    expect(brokerPolicy).toBe('outdated')
    const { main } = await setup(iam, { brokerPolicy })
    expect(writes(iam)).toEqual(['putRolePolicy'])
    expect(main.notices).toEqual([`Repairing IAM role ${NAME}`])
    const repaired = iam.policies.get(POLICY)
    expect(repaired).toEqual(buildPermissionPolicy(AT))
    expect(repaired.Statement.map((s) => s.Sid)).toContain(
      'DevModeBrokerV2InvokeFallback',
    )
    expect(await brokerPolicyState({ iam, name: NAME, ...AT })).toBe('present')
  })

  test('functions-only session continues when repairing a V1 policy is denied', async () => {
    const iam = v1Denied()
    const { broker, policyRepaired, logger } = await setup(iam, {
      brokerPolicy: 'outdated',
    })
    expect(broker).toMatchObject({ externalId: EXT, widened: false })
    expect(policyRepaired).toBe(false)
    expect(logger.notices).toEqual([
      `The IAM role ${NAME} has the permission policy of an earlier version of Dev Mode, which serves functions. An administrator can update it with "serverless dev setup --region us-east-1".`,
    ])
    expect(iam.policies.get(POLICY)).toEqual(
      buildPermissionPolicy({ ...AT, version: 1 }),
    )
  })

  test('web-app session fails when repairing a V1 policy is denied', async () => {
    // Widened already: only the policy stands in the way.
    const iam = v1Denied()
    iam.roles.get(NAME).AssumeRolePolicyDocument = JSON.stringify(
      buildTrustPolicy({ ...AT, externalId: EXT }),
    )
    await expect(
      setup(iam, { webApps: true, brokerPolicy: 'outdated' }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_BROKER_CREATE_DENIED' })
  })

  test('a functions-only session fails when the denied policy is not the previous version as it wrote it', async () => {
    for (const doc of [
      buildPermissionPolicy({ ...AT, version: 0 }),
      { ...buildPermissionPolicy({ ...AT, version: 1 }), Statement: [] },
      null,
    ]) {
      const iam = v1Denied()
      if (doc) iam.policies.set(POLICY, doc)
      else iam.policies.delete(POLICY)
      await expect(
        setup(iam, { brokerPolicy: doc ? 'outdated' : 'missing' }),
      ).rejects.toMatchObject({ code: 'DEV_MODE_BROKER_CREATE_DENIED' })
    }
  })

  test('a repaired policy is reported as repaired', async () => {
    const iam = narrowRole()
    iam.policies.set(POLICY, buildPermissionPolicy({ ...AT, version: 1 }))
    expect(
      (await setup(iam, { brokerPolicy: 'outdated' })).policyRepaired,
    ).toBe(true)
    expect((await setup(iam)).policyRepaired).toBe(false)
  })

  test('a denied widen propagates DEV_MODE_BROKER_UPDATE_DENIED and puts nothing afterwards', async () => {
    const iam = narrowRole()
    iam.policies.set(POLICY, buildPermissionPolicy({ ...AT, version: 1 }))
    iam.updateAssumeRolePolicyError = denied('iam:UpdateAssumeRolePolicy')
    await expect(
      setup(iam, { webApps: true, brokerPolicy: 'outdated' }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_BROKER_UPDATE_DENIED' })
    expect(writes(iam)).toEqual(['updateAssumeRolePolicy'])
    expect(iam.policies.get(POLICY)).toEqual(
      buildPermissionPolicy({ ...AT, version: 1 }),
    )
  })
})
