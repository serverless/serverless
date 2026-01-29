'use strict'

import { describe, it, expect } from '@jest/globals'
import { resolveRole } from '../../../../../../../lib/plugins/aws/bedrock-agentcore/utils/role.js'

describe('resolveRole', () => {
  const generatedRoleLogicalId = 'MyGeneratedRole'

  describe('when role is undefined or null', () => {
    it('should return Fn::GetAtt reference to generated role', () => {
      expect(resolveRole(undefined, generatedRoleLogicalId)).toEqual({
        'Fn::GetAtt': ['MyGeneratedRole', 'Arn'],
      })
    })

    it('should return Fn::GetAtt reference to generated role for null', () => {
      expect(resolveRole(null, generatedRoleLogicalId)).toEqual({
        'Fn::GetAtt': ['MyGeneratedRole', 'Arn'],
      })
    })
  })

  describe('when role is a string', () => {
    it('should return ARN directly when role starts with arn:', () => {
      const arn = 'arn:aws:iam::123456789012:role/MyRole'
      expect(resolveRole(arn, generatedRoleLogicalId)).toBe(arn)
    })

    it('should return Fn::GetAtt reference for logical name', () => {
      expect(resolveRole('MyOtherRole', generatedRoleLogicalId)).toEqual({
        'Fn::GetAtt': ['MyOtherRole', 'Arn'],
      })
    })
  })

  describe('when role is a CloudFormation intrinsic', () => {
    it('should return Ref as-is', () => {
      const role = { Ref: 'SomeRole' }
      expect(resolveRole(role, generatedRoleLogicalId)).toEqual(role)
    })

    it('should return Fn::GetAtt as-is', () => {
      const role = { 'Fn::GetAtt': ['SomeRole', 'Arn'] }
      expect(resolveRole(role, generatedRoleLogicalId)).toEqual(role)
    })

    it('should return Fn::ImportValue as-is', () => {
      const role = { 'Fn::ImportValue': 'SharedRoleArn' }
      expect(resolveRole(role, generatedRoleLogicalId)).toEqual(role)
    })

    it('should return Fn::Sub as-is', () => {
      const role = {
        'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:role/MyRole',
      }
      expect(resolveRole(role, generatedRoleLogicalId)).toEqual(role)
    })

    it('should return Fn::Join as-is', () => {
      const role = {
        'Fn::Join': [
          ':',
          ['arn:aws:iam:', { Ref: 'AWS::AccountId' }, 'role/MyRole'],
        ],
      }
      expect(resolveRole(role, generatedRoleLogicalId)).toEqual(role)
    })
  })

  describe('when role is a customization object', () => {
    it('should return Fn::GetAtt reference to generated role for statements customization', () => {
      const role = {
        statements: [
          {
            Effect: 'Allow',
            Action: 's3:GetObject',
            Resource: '*',
          },
        ],
      }
      expect(resolveRole(role, generatedRoleLogicalId)).toEqual({
        'Fn::GetAtt': ['MyGeneratedRole', 'Arn'],
      })
    })

    it('should return Fn::GetAtt reference to generated role for managedPolicies customization', () => {
      const role = {
        managedPolicies: ['arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess'],
      }
      expect(resolveRole(role, generatedRoleLogicalId)).toEqual({
        'Fn::GetAtt': ['MyGeneratedRole', 'Arn'],
      })
    })

    it('should return Fn::GetAtt reference to generated role for empty object', () => {
      expect(resolveRole({}, generatedRoleLogicalId)).toEqual({
        'Fn::GetAtt': ['MyGeneratedRole', 'Arn'],
      })
    })
  })
})
