import { describe, expect, it } from '@jest/globals'
import { resolveExecutionRoleRef } from '../../../../../../lib/plugins/aws/lib/execution-role.js'

describe('resolveExecutionRoleRef', () => {
  it('uses an ARN as is', () => {
    expect(
      resolveExecutionRoleRef('arn:aws:iam::123456789012:role/web'),
    ).toEqual({ arn: 'arn:aws:iam::123456789012:role/web' })
  })

  it('references the generated role without depending on it', () => {
    expect(resolveExecutionRoleRef('IamRoleLambdaExecution')).toEqual({
      arn: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
    })
  })

  it('references a logical role name and depends on it', () => {
    expect(resolveExecutionRoleRef('WebRole')).toEqual({
      arn: { 'Fn::GetAtt': ['WebRole', 'Arn'] },
      dependsOn: 'WebRole',
    })
  })

  it('depends on the role an Fn::GetAtt names', () => {
    expect(
      resolveExecutionRoleRef({ 'Fn::GetAtt': ['WebRole', 'Arn'] }),
    ).toEqual({
      arn: { 'Fn::GetAtt': ['WebRole', 'Arn'] },
      dependsOn: 'WebRole',
    })
  })

  it('passes other intrinsics through', () => {
    expect(resolveExecutionRoleRef({ 'Fn::ImportValue': 'role' })).toEqual({
      arn: { 'Fn::ImportValue': 'role' },
    })
  })
})
