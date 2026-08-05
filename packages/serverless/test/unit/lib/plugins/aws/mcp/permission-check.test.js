import { jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: { warning: jest.fn(), debug: jest.fn() },
}))

const { byoRoleArnFor, warnMissingStateGrants } =
  await import('../../../../../../lib/plugins/aws/mcp/lib/permission-check.js')
// The real naming object, so the output key looked up here is the one
// `compileStateResources` emits (notably `-` -> `Dash`).
const { default: naming } =
  await import('../../../../../../lib/plugins/aws/lib/naming.js')
const { log } = await import('@serverless/util')

const roleArn = 'arn:aws:iam::123456789012:role/my-role'
const secretArn =
  'arn:aws:secretsmanager:us-east-1:123456789012:secret:CrmKey-Ab12Cd'
const ssmArn = 'arn:aws:ssm:us-east-1:123456789012:parameter/crm/mcp-state-key'

const stackWithOutputs = (outputs) => ({
  Stacks: [
    {
      Outputs: Object.entries(outputs).map(([OutputKey, OutputValue]) => ({
        OutputKey,
        OutputValue,
      })),
    },
  ],
})

const decision = (EvalDecision) => ({
  EvaluationResults: [{ EvalDecision }],
})

const makeRequest = ({ stack, simulate } = {}) =>
  jest.fn(async (service, method) => {
    if (service === 'CloudFormation' && method === 'describeStacks') {
      if (typeof stack === 'function') return stack()
      return stack
    }
    if (service === 'IAM' && method === 'simulatePrincipalPolicy') {
      if (typeof simulate === 'function') return simulate()
      return simulate
    }
    throw new Error(`unexpected request: ${service}.${method}`)
  })

const run = ({ servers, request }) =>
  warnMissingStateGrants({
    servers,
    roleArn,
    stackName: 'acme-dev',
    naming,
    request,
  })

beforeEach(() => {
  log.warning.mockClear()
  log.debug.mockClear()
})

describe('byoRoleArnFor', () => {
  const isExistingRoleProvided = (role) =>
    typeof role === 'string' ||
    (role !== null &&
      typeof role === 'object' &&
      Object.keys(role).some((key) => key.includes('::')))

  const arnFor = (provider) =>
    byoRoleArnFor({ provider, isExistingRoleProvided })

  it('returns the modern iam.role ARN', () => {
    expect(arnFor({ iam: { role: roleArn } })).toBe(roleArn)
  })

  it('returns the legacy provider.role ARN', () => {
    expect(arnFor({ role: roleArn })).toBe(roleArn)
  })

  it('prefers iam.role over the legacy spelling, as the provider does', () => {
    const other = 'arn:aws:iam::123456789012:role/legacy'
    expect(arnFor({ role: other, iam: { role: roleArn } })).toBe(roleArn)
  })

  it('returns nothing for a role the Framework generates', () => {
    expect(arnFor({})).toBeUndefined()
    expect(arnFor({ iam: { role: { statements: [] } } })).toBeUndefined()
  })

  it('returns nothing for a CloudFormation intrinsic', () => {
    expect(
      arnFor({ iam: { role: { 'Fn::GetAtt': ['MyRole', 'Arn'] } } }),
    ).toBeUndefined()
    expect(
      arnFor({ role: { 'Fn::GetAtt': ['MyRole', 'Arn'] } }),
    ).toBeUndefined()
  })

  it('returns nothing for a string that is not a role ARN', () => {
    expect(arnFor({ iam: { role: 'my-role' } })).toBeUndefined()
  })

  // Per-function mode attaches the grant to each server's own role, so the
  // provider-level role is not what reads the key.
  it('returns nothing under per-function role mode', () => {
    expect(
      arnFor({ role: roleArn, iam: { role: { mode: 'perFunction' } } }),
    ).toBeUndefined()
  })
})

describe('warnMissingStateGrants', () => {
  it('warns with the role, the action, the key and the statement to add', async () => {
    const request = makeRequest({
      stack: stackWithOutputs({ CrmMcpStateSecretArn: secretArn }),
      simulate: decision('implicitDeny'),
    })
    await run({ servers: [{ name: 'crm', state: true }], request })
    expect(request).toHaveBeenCalledWith('IAM', 'simulatePrincipalPolicy', {
      PolicySourceArn: roleArn,
      ActionNames: ['secretsmanager:GetSecretValue'],
      ResourceArns: [secretArn],
    })
    expect(log.warning).toHaveBeenCalledTimes(1)
    const message = log.warning.mock.calls[0][0]
    expect(message).toContain('"crm"')
    expect(message).toContain(roleArn)
    expect(message).toContain('secretsmanager:GetSecretValue')
    expect(message).toContain(secretArn)
    expect(message).toContain(
      JSON.stringify({
        Effect: 'Allow',
        Action: 'secretsmanager:GetSecretValue',
        Resource: secretArn,
      }),
    )
  })

  it('stays silent when the role is allowed', async () => {
    const request = makeRequest({
      stack: stackWithOutputs({ CrmMcpStateSecretArn: secretArn }),
      simulate: decision('allowed'),
    })
    await run({ servers: [{ name: 'crm', state: true }], request })
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('checks a bring-your-own key ARN without reading the stack', async () => {
    const request = makeRequest({ simulate: decision('explicitDeny') })
    await run({ servers: [{ name: 'crm', state: ssmArn }], request })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('IAM', 'simulatePrincipalPolicy', {
      PolicySourceArn: roleArn,
      ActionNames: ['ssm:GetParameter'],
      ResourceArns: [ssmArn],
    })
    expect(log.warning.mock.calls[0][0]).toContain('ssm:GetParameter')
  })

  it('stays silent when the simulation itself fails', async () => {
    const request = makeRequest({
      stack: stackWithOutputs({ CrmMcpStateSecretArn: secretArn }),
      simulate: () => {
        throw Object.assign(new Error('User is not authorized'), {
          code: 'AccessDenied',
        })
      },
    })
    await run({ servers: [{ name: 'crm', state: true }], request })
    expect(log.warning).not.toHaveBeenCalled()
    expect(log.debug).toHaveBeenCalled()
  })

  it('stays silent when the stack cannot be read', async () => {
    const request = makeRequest({
      stack: () => {
        throw new Error('Throttling')
      },
    })
    await run({ servers: [{ name: 'crm', state: true }], request })
    expect(log.warning).not.toHaveBeenCalled()
    expect(log.debug).toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('stays silent when the stack has no output for the key', async () => {
    const request = makeRequest({
      stack: stackWithOutputs({ ServiceEndpoint: 'https://example.com' }),
    })
    await run({ servers: [{ name: 'crm', state: true }], request })
    expect(log.warning).not.toHaveBeenCalled()
    expect(log.debug).toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('stays silent when the simulation returns no verdict', async () => {
    const request = makeRequest({
      stack: stackWithOutputs({ CrmMcpStateSecretArn: secretArn }),
      simulate: { EvaluationResults: [] },
    })
    await run({ servers: [{ name: 'crm', state: true }], request })
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('reads the stack once and warns once per denied server', async () => {
    const billingArn =
      'arn:aws:secretsmanager:us-east-1:123456789012:secret:BillingKey-Ef34Gh'
    const request = makeRequest({
      stack: stackWithOutputs({
        CrmMcpStateSecretArn: secretArn,
        BillingDashapiMcpStateSecretArn: billingArn,
      }),
      simulate: decision('implicitDeny'),
    })
    await run({
      servers: [
        { name: 'crm', state: true },
        { name: 'billing-api', state: true },
        { name: 'docs' },
      ],
      request,
    })
    expect(
      request.mock.calls.filter(([, method]) => method === 'describeStacks'),
    ).toHaveLength(1)
    expect(log.warning).toHaveBeenCalledTimes(2)
    expect(log.warning.mock.calls[1][0]).toContain(billingArn)
  })

  it('makes no request at all when no server is state-enabled', async () => {
    const request = makeRequest({})
    await run({ servers: [{ name: 'docs' }], request })
    expect(request).not.toHaveBeenCalled()
    expect(log.warning).not.toHaveBeenCalled()
  })
})
