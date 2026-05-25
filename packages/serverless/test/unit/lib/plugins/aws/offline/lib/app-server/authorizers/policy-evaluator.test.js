import { evaluatePolicy } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/policy-evaluator.js'

const ARN =
  'arn:aws:execute-api:us-east-1:000000000000:offline/dev/GET/items/42'

describe('evaluatePolicy — happy path', () => {
  it('returns allow=true when Allow statement matches exact methodArn', () => {
    const result = evaluatePolicy({
      principalId: 'u-1',
      methodArn: ARN,
      policyDocument: {
        Statement: [{ Effect: 'Allow', Resource: ARN }],
      },
    })
    expect(result).toEqual({ allow: true, principalId: 'u-1', context: {} })
  })

  it('returns context from policy.context when allowed', () => {
    const result = evaluatePolicy({
      principalId: 'u-1',
      methodArn: ARN,
      policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      context: { tenantId: 't-7' },
    })
    expect(result.context).toEqual({ tenantId: 't-7' })
  })

  it('matches wildcard resource "*"', () => {
    const result = evaluatePolicy({
      principalId: 'u',
      methodArn: ARN,
      policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
    })
    expect(result.allow).toBe(true)
  })

  it('matches Resource as array', () => {
    const result = evaluatePolicy({
      principalId: 'u',
      methodArn: ARN,
      policyDocument: {
        Statement: [{ Effect: 'Allow', Resource: ['arn:other', ARN] }],
      },
    })
    expect(result.allow).toBe(true)
  })

  it('matches trailing-* wildcard resource', () => {
    const result = evaluatePolicy({
      principalId: 'u',
      methodArn: ARN,
      policyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Resource:
              'arn:aws:execute-api:us-east-1:000000000000:offline/dev/*',
          },
        ],
      },
    })
    expect(result.allow).toBe(true)
  })
})

describe('evaluatePolicy — deny / no match', () => {
  it('returns allow=false when no Allow matches', () => {
    const result = evaluatePolicy({
      principalId: 'u',
      methodArn: ARN,
      policyDocument: {
        Statement: [{ Effect: 'Allow', Resource: 'arn:something-else' }],
      },
    })
    expect(result.allow).toBe(false)
  })

  it('Deny short-circuits even when Allow also matches', () => {
    const result = evaluatePolicy({
      principalId: 'u',
      methodArn: ARN,
      policyDocument: {
        Statement: [
          { Effect: 'Allow', Resource: '*' },
          { Effect: 'Deny', Resource: ARN },
        ],
      },
    })
    expect(result.allow).toBe(false)
  })

  it('empty Statement array → allow=false', () => {
    const result = evaluatePolicy({
      principalId: 'u',
      methodArn: ARN,
      policyDocument: { Statement: [] },
    })
    expect(result.allow).toBe(false)
  })
})

describe('evaluatePolicy — errors', () => {
  it('throws when principalId is missing', () => {
    expect(() =>
      evaluatePolicy({
        principalId: undefined,
        methodArn: ARN,
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    ).toThrow(/principalId/i)
  })

  it('throws when policyDocument.Statement is not an array', () => {
    expect(() =>
      evaluatePolicy({
        principalId: 'u',
        methodArn: ARN,
        policyDocument: { Statement: 'not-an-array' },
      }),
    ).toThrow(/policy/i)
  })
})
