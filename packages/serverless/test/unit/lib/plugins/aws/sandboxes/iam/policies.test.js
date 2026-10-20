import {
  shouldGenerateRole,
  resolveRole,
  generateBuildRole,
  generateExecutionRole,
  withCustomizations,
} from '../../../../../../../lib/plugins/aws/sandboxes/iam/policies.js'
import { generateOperatorRole } from '../../../../../../../lib/plugins/aws/lib/network-connector.js'

const ctx = {
  serviceName: 'svc',
  stage: 'dev',
  region: 'us-east-1',
  bucket: 'my-artifact-bucket',
}

describe('shouldGenerateRole', () => {
  test('undefined → true (generate with defaults)', () => {
    expect(shouldGenerateRole(undefined)).toBe(true)
  })

  test('ARN string → false', () => {
    expect(shouldGenerateRole('arn:aws:iam::123456789012:role/my-role')).toBe(
      false,
    )
  })

  test('Ref intrinsic → false', () => {
    expect(shouldGenerateRole({ Ref: 'MyRole' })).toBe(false)
  })

  test('Fn::GetAtt intrinsic → false', () => {
    expect(shouldGenerateRole({ 'Fn::GetAtt': ['MyRole', 'Arn'] })).toBe(false)
  })

  test('Fn::ImportValue intrinsic → false', () => {
    expect(shouldGenerateRole({ 'Fn::ImportValue': 'shared-role-arn' })).toBe(
      false,
    )
  })

  test('Fn::Sub intrinsic → false', () => {
    expect(
      shouldGenerateRole({
        'Fn::Sub': 'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/x',
      }),
    ).toBe(false)
  })

  test('customization object with statements → true', () => {
    expect(shouldGenerateRole({ statements: [] })).toBe(true)
  })

  test('customization object with managedPolicies → true', () => {
    expect(
      shouldGenerateRole({
        managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
      }),
    ).toBe(true)
  })

  test('empty object → true', () => {
    expect(shouldGenerateRole({})).toBe(true)
  })
})

describe('resolveRole', () => {
  test('ARN string → returned verbatim', () => {
    const arn = 'arn:aws:iam::123456789012:role/my-role'
    expect(resolveRole(arn, 'SandboxBuildRole')).toBe(arn)
  })

  test('Ref intrinsic → returned verbatim', () => {
    const ref = { Ref: 'MyRole' }
    expect(resolveRole(ref, 'SandboxBuildRole')).toEqual(ref)
  })

  test('Fn::GetAtt intrinsic → returned verbatim', () => {
    const getAtt = { 'Fn::GetAtt': ['MyRole', 'Arn'] }
    expect(resolveRole(getAtt, 'SandboxBuildRole')).toEqual(getAtt)
  })

  test('undefined → Fn::GetAtt on generatedLogicalId', () => {
    expect(resolveRole(undefined, 'SandboxBuildRole')).toEqual({
      'Fn::GetAtt': ['SandboxBuildRole', 'Arn'],
    })
  })

  test('Fn::ImportValue intrinsic → returned verbatim', () => {
    const importValue = { 'Fn::ImportValue': 'shared-role-arn' }
    expect(resolveRole(importValue, 'SandboxBuildRole')).toEqual(importValue)
  })

  test('Fn::Sub intrinsic → returned verbatim', () => {
    const sub = {
      'Fn::Sub': 'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/x',
    }
    expect(resolveRole(sub, 'SandboxBuildRole')).toEqual(sub)
  })

  test('customization object → Fn::GetAtt on generatedLogicalId', () => {
    expect(resolveRole({ statements: [] }, 'SandboxExecRole')).toEqual({
      'Fn::GetAtt': ['SandboxExecRole', 'Arn'],
    })
  })
})

describe('generateBuildRole', () => {
  test('returns AWS::IAM::Role type', () => {
    const role = generateBuildRole('runner', {}, ctx)
    expect(role.Type).toBe('AWS::IAM::Role')
  })

  test('trust policy uses lambda.amazonaws.com principal', () => {
    const role = generateBuildRole('runner', {}, ctx)
    const stmt = role.Properties.AssumeRolePolicyDocument.Statement[0]
    expect(stmt.Principal.Service).toBe('lambda.amazonaws.com')
    expect(stmt.Action).toBe('sts:AssumeRole')
    expect(stmt.Effect).toBe('Allow')
  })

  test('trust policy has aws:SourceAccount condition', () => {
    const role = generateBuildRole('runner', {}, ctx)
    const stmt = role.Properties.AssumeRolePolicyDocument.Statement[0]
    expect(stmt.Condition.StringEquals['aws:SourceAccount']).toEqual({
      Ref: 'AWS::AccountId',
    })
  })

  test('has s3:GetObject permission on artifact bucket', () => {
    const role = generateBuildRole('runner', {}, ctx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const s3Stmt = stmts.find((s) => s.Action.includes('s3:GetObject'))
    expect(s3Stmt).toBeDefined()
    expect(s3Stmt.Effect).toBe('Allow')
    expect(s3Stmt.Resource['Fn::Sub']).toContain('my-artifact-bucket')
  })

  test('s3:GetObject covers BOTH deployment bucket and artifact bucket when they differ (s3:// artifact)', () => {
    const cfg = { artifactBucket: 'other-bucket' }
    const role = generateBuildRole('runner', cfg, ctx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const s3Stmt = stmts.find((s) => s.Action.includes('s3:GetObject'))
    expect(s3Stmt).toBeDefined()
    // Resource must be an array covering both buckets
    expect(Array.isArray(s3Stmt.Resource)).toBe(true)
    const arns = s3Stmt.Resource.map((r) => r['Fn::Sub'])
    expect(arns.some((a) => a.includes('my-artifact-bucket'))).toBe(true)
    expect(arns.some((a) => a.includes('other-bucket'))).toBe(true)
  })

  test('s3:GetObject uses single-bucket form when artifactBucket equals deployment bucket', () => {
    const cfg = { artifactBucket: 'my-artifact-bucket' }
    const role = generateBuildRole('runner', cfg, ctx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const s3Stmt = stmts.find((s) => s.Action.includes('s3:GetObject'))
    // Same bucket → single Resource (not an array)
    expect(Array.isArray(s3Stmt.Resource)).toBe(false)
    expect(s3Stmt.Resource['Fn::Sub']).toContain('my-artifact-bucket')
  })

  test('s3:GetObject references the in-stack bucket via Ref when the bucket is a CFN intrinsic (no resolved name)', () => {
    // In-stack ServerlessDeploymentBucket: the name is unknown at package time,
    // so the orchestrator passes the same Ref it uses for CodeArtifact.Uri.
    const inStackCtx = { ...ctx, bucket: { Ref: 'ServerlessDeploymentBucket' } }
    const role = generateBuildRole('runner', {}, inStackCtx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const s3Stmt = stmts.find((s) => s.Action.includes('s3:GetObject'))
    expect(s3Stmt.Resource).toEqual({
      'Fn::Sub': [
        'arn:${AWS::Partition}:s3:::${B}/*',
        { B: { Ref: 'ServerlessDeploymentBucket' } },
      ],
    })
    expect(JSON.stringify(s3Stmt.Resource)).not.toContain('undefined')
  })

  test('s3:GetObject covers the in-stack bucket (Ref) AND a separate s3:// artifact bucket', () => {
    const inStackCtx = { ...ctx, bucket: { Ref: 'ServerlessDeploymentBucket' } }
    const role = generateBuildRole(
      'runner',
      { artifactBucket: 'other-bucket' },
      inStackCtx,
    )
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const s3Stmt = stmts.find((s) => s.Action.includes('s3:GetObject'))
    expect(s3Stmt.Resource).toEqual([
      {
        'Fn::Sub': [
          'arn:${AWS::Partition}:s3:::${B}/*',
          { B: { Ref: 'ServerlessDeploymentBucket' } },
        ],
      },
      { 'Fn::Sub': 'arn:${AWS::Partition}:s3:::other-bucket/*' },
    ])
  })

  test('has CloudWatch Logs permissions on /aws/lambda-microvms/*', () => {
    const role = generateBuildRole('runner', {}, ctx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const actions = stmts.flatMap((s) => s.Action)
    expect(actions).toEqual(
      expect.arrayContaining([
        's3:GetObject',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ]),
    )
    const createStmt = stmts.find((s) =>
      s.Action.includes('logs:CreateLogGroup'),
    )
    expect(createStmt.Resource['Fn::Sub']).toContain('/aws/lambda-microvms/')
    const putStmt = stmts.find((s) => s.Action.includes('logs:PutLogEvents'))
    expect(putStmt.Resource['Fn::Sub']).toContain('/aws/lambda-microvms/')
    expect(putStmt.Resource['Fn::Sub']).toMatch(/:log-stream:\*$/)
  })

  test('merges custom statements from cfg.iam.buildRole', () => {
    const cfg = {
      iam: {
        buildRole: {
          statements: [
            {
              Effect: 'Allow',
              Action: ['ec2:DescribeInstances'],
              Resource: '*',
            },
          ],
        },
      },
    }
    const role = generateBuildRole('runner', cfg, ctx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const ec2Stmt = stmts.find((s) =>
      s.Action.includes('ec2:DescribeInstances'),
    )
    expect(ec2Stmt).toBeDefined()
  })

  test('merges managedPolicies from cfg.iam.buildRole', () => {
    const cfg = {
      iam: {
        buildRole: {
          managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
        },
      },
    }
    const role = generateBuildRole('runner', cfg, ctx)
    expect(role.Properties.ManagedPolicyArns).toContain(
      'arn:aws:iam::aws:policy/ReadOnlyAccess',
    )
  })

  test('sets permissionsBoundary from cfg.iam.buildRole', () => {
    const cfg = {
      iam: {
        buildRole: {
          permissionsBoundary: 'arn:aws:iam::123456789012:policy/boundary',
        },
      },
    }
    const role = generateBuildRole('runner', cfg, ctx)
    expect(role.Properties.PermissionsBoundary).toBe(
      'arn:aws:iam::123456789012:policy/boundary',
    )
  })

  test('no customizations → no ManagedPolicyArns, no PermissionsBoundary', () => {
    const role = generateBuildRole('runner', {}, ctx)
    expect(role.Properties.ManagedPolicyArns).toBeUndefined()
    expect(role.Properties.PermissionsBoundary).toBeUndefined()
  })
})

describe('generateExecutionRole', () => {
  test('returns AWS::IAM::Role type', () => {
    const role = generateExecutionRole('runner', {}, ctx)
    expect(role.Type).toBe('AWS::IAM::Role')
  })

  test('trust policy uses lambda.amazonaws.com principal', () => {
    const role = generateExecutionRole('runner', {}, ctx)
    const stmt = role.Properties.AssumeRolePolicyDocument.Statement[0]
    expect(stmt.Principal.Service).toBe('lambda.amazonaws.com')
  })

  test('trust policy has aws:SourceAccount condition', () => {
    const role = generateExecutionRole('runner', {}, ctx)
    const stmt = role.Properties.AssumeRolePolicyDocument.Statement[0]
    expect(stmt.Condition.StringEquals['aws:SourceAccount']).toEqual({
      Ref: 'AWS::AccountId',
    })
  })

  test('has CloudWatch Logs permissions on /aws/lambda-microvms/*', () => {
    const role = generateExecutionRole('runner', {}, ctx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const actions = stmts.flatMap((s) => s.Action)
    expect(actions).toEqual(
      expect.arrayContaining([
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ]),
    )
    const createStmt = stmts.find((s) =>
      s.Action.includes('logs:CreateLogGroup'),
    )
    expect(createStmt.Resource['Fn::Sub']).toContain('/aws/lambda-microvms/')
    const putStmt = stmts.find((s) => s.Action.includes('logs:PutLogEvents'))
    expect(putStmt.Resource['Fn::Sub']).toContain('/aws/lambda-microvms/')
    expect(putStmt.Resource['Fn::Sub']).toMatch(/:log-stream:\*$/)
  })

  test('merges custom statements from cfg.iam.executionRole', () => {
    const cfg = {
      iam: {
        executionRole: {
          statements: [
            { Effect: 'Allow', Action: ['dynamodb:GetItem'], Resource: '*' },
          ],
        },
      },
    }
    const role = generateExecutionRole('runner', cfg, ctx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const dynStmt = stmts.find((s) => s.Action.includes('dynamodb:GetItem'))
    expect(dynStmt).toBeDefined()
  })

  test('scopes the logs grant to the resolved log group (custom override)', () => {
    const role = generateExecutionRole(
      'runner',
      {},
      {
        ...ctx,
        logGroupName: '/my-org/sbx/runner',
      },
    )
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const create = stmts.find((s) => s.Action.includes('logs:CreateLogGroup'))
    expect(create.Resource['Fn::Sub']).toContain(
      ':log-group:/my-org/sbx/runner:*',
    )
    const put = stmts.find((s) => s.Action.includes('logs:PutLogEvents'))
    expect(put.Resource['Fn::Sub']).toContain(
      ':log-group:/my-org/sbx/runner:log-stream:*',
    )
  })

  test('omits the logs policy entirely when logging is disabled', () => {
    const role = generateExecutionRole(
      'runner',
      {},
      {
        ...ctx,
        loggingDisabled: true,
      },
    )
    // No inline policy at all — a logging-disabled VM needs no logs:* grant,
    // and an inline policy with zero statements would be invalid.
    expect(role.Properties.Policies).toBeUndefined()
  })

  test('applies custom statements even when logging is disabled (creates the policy holder)', () => {
    const cfg = {
      iam: {
        executionRole: {
          statements: [
            { Effect: 'Allow', Action: ['s3:GetObject'], Resource: '*' },
          ],
        },
      },
    }
    const role = generateExecutionRole('runner', cfg, {
      ...ctx,
      loggingDisabled: true,
    })
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    expect(stmts.some((s) => s.Action.includes('s3:GetObject'))).toBe(true)
    // ...but no logs grant, since logging is off.
    expect(stmts.flatMap((s) => s.Action)).not.toContain('logs:PutLogEvents')
  })

  test('merges managedPolicies from cfg.iam.executionRole', () => {
    const cfg = {
      iam: {
        executionRole: {
          managedPolicies: ['arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess'],
        },
      },
    }
    const role = generateExecutionRole('runner', cfg, ctx)
    expect(role.Properties.ManagedPolicyArns).toContain(
      'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess',
    )
  })

  test('sets permissionsBoundary from cfg.iam.executionRole', () => {
    const cfg = {
      iam: {
        executionRole: {
          permissionsBoundary: 'arn:aws:iam::123456789012:policy/exec-boundary',
        },
      },
    }
    const role = generateExecutionRole('runner', cfg, ctx)
    expect(role.Properties.PermissionsBoundary).toBe(
      'arn:aws:iam::123456789012:policy/exec-boundary',
    )
  })

  test('no customizations → no ManagedPolicyArns, no PermissionsBoundary', () => {
    const role = generateExecutionRole('runner', {}, ctx)
    expect(role.Properties.ManagedPolicyArns).toBeUndefined()
    expect(role.Properties.PermissionsBoundary).toBeUndefined()
  })
})

// The sandbox operator role is the shared network-connector role with the
// sandbox's `iam.operatorRole` customizations applied, as the orchestrator does.
const sandboxOperatorRole = (operatorRole) =>
  withCustomizations(
    generateOperatorRole({ policyName: 'sandboxes-network-connector-policy' }),
    operatorRole,
  )

describe('withCustomizations on the operator role', () => {
  test('appends custom statements to the network-connector policy, keeping base statements', () => {
    const role = sandboxOperatorRole({
      statements: [
        {
          Effect: 'Allow',
          Action: ['ec2:CreateNetworkInterface'],
          Resource: 'arn:aws:ec2:us-east-1:999999999999:subnet/*',
        },
      ],
    })
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    // Appended last, after the generated CreateNetworkInterface/CreateTags
    // statements — customization is additive, never a replacement.
    expect(role.Properties.Policies).toHaveLength(1)
    expect(stmts.at(-1).Resource).toBe(
      'arn:aws:ec2:us-east-1:999999999999:subnet/*',
    )
    const actions = stmts.flatMap((s) => [s.Action].flat())
    expect(actions).toEqual(
      expect.arrayContaining(['ec2:CreateNetworkInterface', 'ec2:CreateTags']),
    )
  })

  test('attaches managedPolicies from iam.operatorRole', () => {
    const role = sandboxOperatorRole({
      managedPolicies: ['arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess'],
    })
    expect(role.Properties.ManagedPolicyArns).toContain(
      'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess',
    )
  })

  test('sets permissionsBoundary from iam.operatorRole', () => {
    const role = sandboxOperatorRole({
      permissionsBoundary: 'arn:aws:iam::123456789012:policy/exec-boundary',
    })
    expect(role.Properties.PermissionsBoundary).toBe(
      'arn:aws:iam::123456789012:policy/exec-boundary',
    )
  })

  test('ARN string and CFN intrinsic are not treated as customization objects', () => {
    const plain = sandboxOperatorRole(undefined)
    expect(sandboxOperatorRole('arn:aws:iam::123456789012:role/x')).toEqual(
      plain,
    )
    expect(sandboxOperatorRole({ 'Fn::ImportValue': 'X' })).toEqual(plain)
  })
})
