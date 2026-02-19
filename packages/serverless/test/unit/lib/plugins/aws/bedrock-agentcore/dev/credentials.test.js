'use strict'

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals'
import {
  LOCAL_DEV_POLICY_SID,
  getRoleNameFromArn,
  areCredentialsExpiring,
  getCredentialExpirationMinutes,
  findDevPolicyStatementIndex,
  createDevPolicyStatement,
  getPolicyPrincipals,
  isPrincipalInPolicy,
  addPrincipalToPolicy,
  calculateBackoffDelay,
  normalizeAssumedRoleArn,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/dev/credentials.js'

describe('dev/credentials', () => {
  describe('LOCAL_DEV_POLICY_SID', () => {
    it('should be the expected value', () => {
      expect(LOCAL_DEV_POLICY_SID).toBe('ServerlessAgentCoreLocalDevPolicy')
    })
  })

  describe('getRoleNameFromArn', () => {
    it('should extract role name from simple ARN', () => {
      const arn = 'arn:aws:iam::123456789012:role/my-role'
      expect(getRoleNameFromArn(arn)).toBe('my-role')
    })

    it('should extract role name from ARN with path', () => {
      const arn = 'arn:aws:iam::123456789012:role/service-role/my-role'
      expect(getRoleNameFromArn(arn)).toBe('my-role')
    })
  })

  describe('areCredentialsExpiring', () => {
    let realDateNow
    const mockNow = 1704067200000 // 2024-01-01T00:00:00.000Z

    beforeEach(() => {
      realDateNow = Date.now
      Date.now = jest.fn(() => mockNow)
    })

    afterEach(() => {
      Date.now = realDateNow
    })

    it('should return true when credentials are missing', () => {
      expect(areCredentialsExpiring(null)).toBe(true)
      expect(areCredentialsExpiring(undefined)).toBe(true)
    })

    it('should return true when Expiration is missing', () => {
      expect(areCredentialsExpiring({})).toBe(true)
    })

    it('should return true when credentials expire within threshold', () => {
      const credentials = {
        Expiration: new Date(mockNow + 5 * 60 * 1000).toISOString(), // 5 minutes from now
      }
      expect(areCredentialsExpiring(credentials)).toBe(true) // Default threshold is 10 minutes
    })

    it('should return false when credentials have more time left', () => {
      const credentials = {
        Expiration: new Date(mockNow + 60 * 60 * 1000).toISOString(), // 1 hour from now
      }
      expect(areCredentialsExpiring(credentials)).toBe(false)
    })

    it('should respect custom threshold', () => {
      const credentials = {
        Expiration: new Date(mockNow + 5 * 60 * 1000).toISOString(), // 5 minutes from now
      }
      expect(areCredentialsExpiring(credentials, 3 * 60 * 1000)).toBe(false) // 3 minute threshold
    })
  })

  describe('getCredentialExpirationMinutes', () => {
    let realDateNow
    const mockNow = 1704067200000

    beforeEach(() => {
      realDateNow = Date.now
      Date.now = jest.fn(() => mockNow)
    })

    afterEach(() => {
      Date.now = realDateNow
    })

    it('should return 0 when credentials are missing', () => {
      expect(getCredentialExpirationMinutes(null)).toBe(0)
      expect(getCredentialExpirationMinutes({})).toBe(0)
    })

    it('should return correct minutes until expiration', () => {
      const credentials = {
        Expiration: new Date(mockNow + 30 * 60 * 1000).toISOString(), // 30 minutes from now
      }
      expect(getCredentialExpirationMinutes(credentials)).toBe(30)
    })

    it('should return negative value for expired credentials', () => {
      const credentials = {
        Expiration: new Date(mockNow - 10 * 60 * 1000).toISOString(), // 10 minutes ago
      }
      expect(getCredentialExpirationMinutes(credentials)).toBe(-10)
    })
  })

  describe('findDevPolicyStatementIndex', () => {
    it('should return -1 for invalid trust policy', () => {
      expect(findDevPolicyStatementIndex(null)).toBe(-1)
      expect(findDevPolicyStatementIndex({})).toBe(-1)
      expect(findDevPolicyStatementIndex({ Statement: 'not-array' })).toBe(-1)
    })

    it('should return -1 when dev policy is not present', () => {
      const trustPolicy = {
        Statement: [{ Sid: 'OtherPolicy', Effect: 'Allow' }],
      }
      expect(findDevPolicyStatementIndex(trustPolicy)).toBe(-1)
    })

    it('should return index when dev policy is present', () => {
      const trustPolicy = {
        Statement: [
          { Sid: 'OtherPolicy', Effect: 'Allow' },
          { Sid: LOCAL_DEV_POLICY_SID, Effect: 'Allow' },
        ],
      }
      expect(findDevPolicyStatementIndex(trustPolicy)).toBe(1)
    })
  })

  describe('createDevPolicyStatement', () => {
    it('should create a valid policy statement', () => {
      const userArn = 'arn:aws:iam::123456789012:user/dev-user'
      const statement = createDevPolicyStatement(userArn)

      expect(statement.Sid).toBe(LOCAL_DEV_POLICY_SID)
      expect(statement.Effect).toBe('Allow')
      expect(statement.Action).toBe('sts:AssumeRole')
      expect(statement.Principal.AWS).toEqual([userArn])
    })
  })

  describe('getPolicyPrincipals', () => {
    it('should return empty array for invalid statement', () => {
      expect(getPolicyPrincipals(null)).toEqual([])
      expect(getPolicyPrincipals({})).toEqual([])
      expect(getPolicyPrincipals({ Principal: {} })).toEqual([])
    })

    it('should return array when AWS is an array', () => {
      const statement = {
        Principal: {
          AWS: ['arn:1', 'arn:2'],
        },
      }
      expect(getPolicyPrincipals(statement)).toEqual(['arn:1', 'arn:2'])
    })

    it('should return array when AWS is a string', () => {
      const statement = {
        Principal: {
          AWS: 'arn:single',
        },
      }
      expect(getPolicyPrincipals(statement)).toEqual(['arn:single'])
    })
  })

  describe('isPrincipalInPolicy', () => {
    it('should return false for invalid statement', () => {
      expect(isPrincipalInPolicy(null, 'arn:test')).toBe(false)
    })

    it('should return true when principal is in policy', () => {
      const statement = {
        Principal: { AWS: ['arn:user1', 'arn:user2'] },
      }
      expect(isPrincipalInPolicy(statement, 'arn:user1')).toBe(true)
    })

    it('should return false when principal is not in policy', () => {
      const statement = {
        Principal: { AWS: ['arn:user1', 'arn:user2'] },
      }
      expect(isPrincipalInPolicy(statement, 'arn:user3')).toBe(false)
    })
  })

  describe('addPrincipalToPolicy', () => {
    it('should add principal when not present', () => {
      const statement = {
        Principal: { AWS: ['arn:user1'] },
      }
      addPrincipalToPolicy(statement, 'arn:user2')
      expect(statement.Principal.AWS).toEqual(['arn:user1', 'arn:user2'])
    })

    it('should not duplicate principal when already present', () => {
      const statement = {
        Principal: { AWS: ['arn:user1', 'arn:user2'] },
      }
      addPrincipalToPolicy(statement, 'arn:user1')
      expect(statement.Principal.AWS).toEqual(['arn:user1', 'arn:user2'])
    })
  })

  describe('normalizeAssumedRoleArn', () => {
    it('should return arn as-is when not an assumed-role session ARN', () => {
      const arn = 'arn:aws:iam::123456789012:role/my-role'
      expect(normalizeAssumedRoleArn(arn)).toBe(arn)
    })

    it('should normalize standard assumed-role session ARN to IAM role ARN', () => {
      expect(
        normalizeAssumedRoleArn(
          'arn:aws:sts::123456789012:assumed-role/MyRole/session',
        ),
      ).toBe('arn:aws:iam::123456789012:role/MyRole')
    })

    it('should normalize SSO assumed-role ARN with aws-reserved path', () => {
      expect(
        normalizeAssumedRoleArn(
          'arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_Admin_abc123/user@example.com',
        ),
      ).toBe(
        'arn:aws:iam::123456789012:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_Admin_abc123',
      )
    })

    it('should preserve GovCloud partition in normalized ARN', () => {
      expect(
        normalizeAssumedRoleArn(
          'arn:aws-us-gov:sts::123456789012:assumed-role/MyRole/session',
        ),
      ).toBe('arn:aws-us-gov:iam::123456789012:role/MyRole')
    })

    it('should preserve China partition in normalized ARN', () => {
      expect(
        normalizeAssumedRoleArn(
          'arn:aws-cn:sts::123456789012:assumed-role/MyRole/session',
        ),
      ).toBe('arn:aws-cn:iam::123456789012:role/MyRole')
    })

    it('should preserve GovCloud partition for SSO assumed-role ARN', () => {
      expect(
        normalizeAssumedRoleArn(
          'arn:aws-us-gov:sts::123456789012:assumed-role/AWSReservedSSO_Admin_abc123/user@example.com',
        ),
      ).toBe(
        'arn:aws-us-gov:iam::123456789012:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_Admin_abc123',
      )
    })

    it('should return IAM user ARN as-is', () => {
      const arn = 'arn:aws:iam::123456789012:user/dev-user'
      expect(normalizeAssumedRoleArn(arn)).toBe(arn)
    })
  })

  describe('calculateBackoffDelay', () => {
    it('should return base delay for first attempt', () => {
      expect(calculateBackoffDelay(1)).toBe(5000)
    })

    it('should double delay for each attempt', () => {
      expect(calculateBackoffDelay(1)).toBe(5000)
      expect(calculateBackoffDelay(2)).toBe(10000)
      expect(calculateBackoffDelay(3)).toBe(20000)
    })

    it('should cap at max delay', () => {
      expect(calculateBackoffDelay(10)).toBe(30000) // Would be 2560000 without cap
    })

    it('should respect custom base and max', () => {
      expect(calculateBackoffDelay(1, 1000, 10000)).toBe(1000)
      expect(calculateBackoffDelay(5, 1000, 10000)).toBe(10000) // Capped
    })
  })
})
