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

describe('evaluatePolicy — resource wildcards', () => {
  const REQ =
    'arn:aws:execute-api:us-east-1:000000000000:abcdef123/dev/GET/users/42/profile'
  const allowOn = (resource) =>
    evaluatePolicy({
      principalId: 'u',
      methodArn: REQ,
      policyDocument: { Statement: [{ Effect: 'Allow', Resource: resource }] },
    }).allow

  it('matches a mid-path * wildcard', () => {
    expect(
      allowOn(
        'arn:aws:execute-api:us-east-1:000000000000:abcdef123/dev/GET/users/*/profile',
      ),
    ).toBe(true)
  })

  it('matches a ? single-character wildcard', () => {
    expect(
      allowOn(
        'arn:aws:execute-api:us-east-1:000000000000:abcdef123/dev/GET/users/4?/profile',
      ),
    ).toBe(true)
  })

  it('denies when a non-* segment (region) differs', () => {
    expect(
      allowOn('arn:aws:execute-api:eu-west-1:000000000000:abcdef123/dev/*'),
    ).toBe(false)
  })

  it('matches the arn:aws:execute-api:** catch-all', () => {
    expect(allowOn('arn:aws:execute-api:**')).toBe(true)
  })

  it('still matches trailing-*, exact, and *', () => {
    expect(
      allowOn('arn:aws:execute-api:us-east-1:000000000000:abcdef123/dev/*'),
    ).toBe(true)
    expect(allowOn(REQ)).toBe(true)
    expect(allowOn('*')).toBe(true)
  })

  it('anchors the path match (no partial-prefix false positive)', () => {
    expect(
      allowOn(
        'arn:aws:execute-api:us-east-1:000000000000:abcdef123/dev/GET/users/42',
      ),
    ).toBe(false)
  })
})
