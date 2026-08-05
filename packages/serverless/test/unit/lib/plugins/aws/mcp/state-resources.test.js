import { describe, it, expect } from '@jest/globals'
import {
  compileStateResources,
  stateIamStatements,
  stateKeyRefs,
} from '../../../../../../lib/plugins/aws/mcp/lib/state-resources.js'
// The real naming object, so logical IDs under test are the ones the provider
// would produce (notably `-` -> `Dash`, which a hand-rolled upper-first mock
// gets wrong and would let an invalid logical ID through).
import naming from '../../../../../../lib/plugins/aws/lib/naming.js'

describe('compileStateResources', () => {
  it('emits a GenerateSecretString secret + output for state: true', () => {
    const template = { Resources: {}, Outputs: {} }
    const refs = compileStateResources({
      servers: [{ name: 'crm', state: true }],
      template,
      naming,
    })
    expect(template.Resources.CrmMcpStateSecret).toEqual({
      Type: 'AWS::SecretsManager::Secret',
      Properties: {
        Description: 'Serverless MCP requestState key for server "crm"',
        GenerateSecretString: {
          PasswordLength: 44,
          ExcludePunctuation: true,
        },
      },
    })
    expect(template.Outputs.CrmMcpStateSecretArn).toEqual({
      Value: { Ref: 'CrmMcpStateSecret' },
    })
    expect(refs.crm).toEqual({ keyRef: { Ref: 'CrmMcpStateSecret' } })
  })

  it('passes a BYO ARN through without creating resources', () => {
    const template = { Resources: {}, Outputs: {} }
    const arn = 'arn:aws:ssm:us-east-1:123456789012:parameter/mcp-key'
    const refs = compileStateResources({
      servers: [{ name: 'crm', state: arn }],
      template,
      naming,
    })
    expect(Object.keys(template.Resources)).toHaveLength(0)
    expect(refs.crm).toEqual({ keyRef: arn })
  })

  it('does nothing when state is omitted', () => {
    const template = { Resources: {}, Outputs: {} }
    const refs = compileStateResources({
      servers: [{ name: 'crm' }],
      template,
      naming,
    })
    expect(refs.crm).toBeUndefined()
    expect(Object.keys(template.Resources)).toHaveLength(0)
  })

  it('emits one secret per state-enabled server', () => {
    const template = { Resources: {}, Outputs: {} }
    const refs = compileStateResources({
      servers: [
        { name: 'crm', state: true },
        { name: 'docs' },
        { name: 'billing-api', state: true },
      ],
      template,
      naming,
    })
    expect(Object.keys(template.Resources)).toEqual([
      'CrmMcpStateSecret',
      'BillingDashapiMcpStateSecret',
    ])
    expect(Object.keys(refs)).toEqual(['crm', 'billing-api'])
  })
})

describe('stateKeyRefs', () => {
  // The plugin needs the `{Ref}` before the compiled template exists, so ref
  // derivation must be usable on its own.
  it('derives refs for state-enabled servers only, without a template', () => {
    const servers = [
      { name: 'crm', state: true },
      { name: 'docs', state: 'arn:aws:ssm:us-east-1:123456789012:parameter/k' },
      { name: 'search' },
      { name: 'legacy', state: false },
    ]
    expect(stateKeyRefs({ servers, naming })).toEqual({
      crm: { keyRef: { Ref: 'CrmMcpStateSecret' } },
      docs: { keyRef: 'arn:aws:ssm:us-east-1:123456789012:parameter/k' },
    })
  })

  // The refs are handed to IAM and to function environments before the secrets
  // are emitted, so every in-stack ref must name a resource that the later hook
  // actually creates - and no ref may point at a logical ID that never appears.
  it('points every in-stack ref at an emitted resource', () => {
    const servers = [
      { name: 'crm', state: true },
      { name: 'docs' },
      { name: 'billing-api', state: true },
    ]
    const template = { Resources: {}, Outputs: {} }
    const refs = compileStateResources({ servers, template, naming })
    expect(Object.values(refs).map((r) => r.keyRef.Ref)).toEqual(
      Object.keys(template.Resources),
    )
  })
})

describe('stateIamStatements', () => {
  it('grants secretsmanager:GetSecretValue for an in-stack secret', () => {
    expect(
      stateIamStatements({ crm: { keyRef: { Ref: 'CrmMcpStateSecret' } } }),
    ).toEqual([
      {
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [{ Ref: 'CrmMcpStateSecret' }],
      },
    ])
  })

  it('grants ssm:GetParameter for a BYO SSM parameter ARN', () => {
    const arn =
      'arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/mcp-key'
    expect(stateIamStatements({ crm: { keyRef: arn } })).toEqual([
      { Effect: 'Allow', Action: ['ssm:GetParameter'], Resource: [arn] },
    ])
  })

  it('grants secretsmanager:GetSecretValue for a BYO secret ARN', () => {
    const arn =
      'arn:aws:secretsmanager:us-east-1:123456789012:secret:mcp-key-AbCdEf'
    expect(stateIamStatements({ crm: { keyRef: arn } })).toEqual([
      {
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [arn],
      },
    ])
  })

  it('returns no statements when nothing is state-enabled', () => {
    expect(stateIamStatements({})).toEqual([])
  })
})
