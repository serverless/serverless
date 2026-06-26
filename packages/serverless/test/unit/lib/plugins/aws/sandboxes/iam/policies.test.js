import {
  shouldGenerateRole,
  resolveRole,
  generateBuildRole,
  generateExecutionRole,
  generateOperatorRole,
} from '../../../../../../../lib/plugins/aws/sandboxes/iam/policies.js'

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

const operatorCtx = {
  serviceName: 'svc',
  stage: 'dev',
  region: 'us-east-1',
}

describe('generateOperatorRole', () => {
  test('returns AWS::IAM::Role type', () => {
    const role = generateOperatorRole('runner', operatorCtx)
    expect(role.Type).toBe('AWS::IAM::Role')
  })

  test('trust principal is network-connectors.lambda.amazonaws.com', () => {
    const role = generateOperatorRole('runner', operatorCtx)
    const stmt = role.Properties.AssumeRolePolicyDocument.Statement[0]
    expect(stmt.Principal.Service).toBe(
      'network-connectors.lambda.amazonaws.com',
    )
    expect(stmt.Action).toBe('sts:AssumeRole')
    expect(stmt.Effect).toBe('Allow')
  })

  test('trust policy has NO aws:SourceAccount condition (network-connectors service cannot assume it otherwise)', () => {
    // Unlike the build/exec roles (lambda.amazonaws.com), the
    // network-connectors.lambda.amazonaws.com service does not present
    // SourceAccount; adding the condition makes the connector deploy fail with
    // "unable to assume the provided NetworkConnectorOperatorRole".
    const role = generateOperatorRole('runner', operatorCtx)
    const stmt = role.Properties.AssumeRolePolicyDocument.Statement[0]
    expect(stmt.Condition).toBeUndefined()
  })

  test('has ec2:CreateNetworkInterface permission', () => {
    const role = generateOperatorRole('runner', operatorCtx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const stmt = stmts.find((s) =>
      [s.Action].flat().includes('ec2:CreateNetworkInterface'),
    )
    expect(stmt).toBeDefined()
    expect(stmt.Effect).toBe('Allow')
  })

  test('ec2:CreateNetworkInterface resources cover network-interface, subnet, security-group', () => {
    const role = generateOperatorRole('runner', operatorCtx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const stmt = stmts.find((s) =>
      [s.Action].flat().includes('ec2:CreateNetworkInterface'),
    )
    const resources = [stmt.Resource].flat().map((r) => {
      // handle Fn::Sub strings
      if (typeof r === 'string') return r
      if (r['Fn::Sub']) return r['Fn::Sub']
      return JSON.stringify(r)
    })
    const combined = resources.join(' ')
    expect(combined).toContain('network-interface')
    expect(combined).toContain('subnet')
    expect(combined).toContain('security-group')
  })

  test('has ec2:CreateTags permission', () => {
    const role = generateOperatorRole('runner', operatorCtx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const stmt = stmts.find((s) => [s.Action].flat().includes('ec2:CreateTags'))
    expect(stmt).toBeDefined()
    expect(stmt.Effect).toBe('Allow')
  })

  test('ec2:CreateTags has ec2:ManagedResourceOperator StringEquals condition', () => {
    const role = generateOperatorRole('runner', operatorCtx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const stmt = stmts.find((s) => [s.Action].flat().includes('ec2:CreateTags'))
    expect(stmt.Condition.StringEquals['ec2:ManagedResourceOperator']).toBe(
      'network-connectors.lambda.amazonaws.com',
    )
  })

  test('ec2:CreateTags is scoped to network-interface ARNs, not "*"', () => {
    const role = generateOperatorRole('runner', operatorCtx)
    const stmts = role.Properties.Policies[0].PolicyDocument.Statement
    const stmt = stmts.find((s) => [s.Action].flat().includes('ec2:CreateTags'))
    expect(stmt.Resource).not.toBe('*')
    expect(stmt.Resource['Fn::Sub']).toContain('network-interface/*')
  })

  test('flatMap of all actions contains both ec2:CreateNetworkInterface and ec2:CreateTags', () => {
    const role = generateOperatorRole('runner', operatorCtx)
    const actions =
      role.Properties.Policies[0].PolicyDocument.Statement.flatMap((s) =>
        [s.Action].flat(),
      )
    expect(actions).toEqual(
      expect.arrayContaining(['ec2:CreateNetworkInterface', 'ec2:CreateTags']),
    )
  })
})
