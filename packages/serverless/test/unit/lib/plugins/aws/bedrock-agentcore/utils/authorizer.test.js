'use strict'

import { describe, it, expect } from '@jest/globals'
import { transformCustomClaims } from '../../../../../../../lib/plugins/aws/bedrock-agentcore/utils/authorizer.js'

describe('transformCustomClaims', () => {
  describe('when customClaims is undefined or null', () => {
    it('should return null for undefined', () => {
      expect(transformCustomClaims(undefined)).toBeNull()
    })

    it('should return null for null', () => {
      expect(transformCustomClaims(null)).toBeNull()
    })

    it('should return null for non-array', () => {
      expect(transformCustomClaims({})).toBeNull()
      expect(transformCustomClaims('string')).toBeNull()
    })
  })

  describe('when customClaims is an empty array', () => {
    it('should return an empty array', () => {
      expect(transformCustomClaims([])).toEqual([])
    })
  })

  describe('when customClaims has basic claims', () => {
    it('should transform basic claim properties', () => {
      const input = [
        {
          inboundTokenClaimName: 'sub',
          inboundTokenClaimValueType: 'STRING',
        },
      ]

      expect(transformCustomClaims(input)).toEqual([
        {
          InboundTokenClaimName: 'sub',
          InboundTokenClaimValueType: 'STRING',
        },
      ])
    })
  })

  describe('when customClaims has authorizingClaimMatchValue', () => {
    it('should transform claim with matchValueString', () => {
      const input = [
        {
          inboundTokenClaimName: 'sub',
          inboundTokenClaimValueType: 'STRING',
          authorizingClaimMatchValue: {
            claimMatchOperator: 'EQUALS',
            claimMatchValue: {
              matchValueString: 'expected-value',
            },
          },
        },
      ]

      expect(transformCustomClaims(input)).toEqual([
        {
          InboundTokenClaimName: 'sub',
          InboundTokenClaimValueType: 'STRING',
          AuthorizingClaimMatchValue: {
            ClaimMatchOperator: 'EQUALS',
            ClaimMatchValue: {
              MatchValueString: 'expected-value',
            },
          },
        },
      ])
    })

    it('should transform claim with matchValueStringList', () => {
      const input = [
        {
          inboundTokenClaimName: 'groups',
          inboundTokenClaimValueType: 'STRING_LIST',
          authorizingClaimMatchValue: {
            claimMatchOperator: 'CONTAINS',
            claimMatchValue: {
              matchValueStringList: ['admin', 'user'],
            },
          },
        },
      ]

      expect(transformCustomClaims(input)).toEqual([
        {
          InboundTokenClaimName: 'groups',
          InboundTokenClaimValueType: 'STRING_LIST',
          AuthorizingClaimMatchValue: {
            ClaimMatchOperator: 'CONTAINS',
            ClaimMatchValue: {
              MatchValueStringList: ['admin', 'user'],
            },
          },
        },
      ])
    })

    it('should transform claim without claimMatchValue', () => {
      const input = [
        {
          inboundTokenClaimName: 'sub',
          inboundTokenClaimValueType: 'STRING',
          authorizingClaimMatchValue: {
            claimMatchOperator: 'EXISTS',
          },
        },
      ]

      expect(transformCustomClaims(input)).toEqual([
        {
          InboundTokenClaimName: 'sub',
          InboundTokenClaimValueType: 'STRING',
          AuthorizingClaimMatchValue: {
            ClaimMatchOperator: 'EXISTS',
          },
        },
      ])
    })
  })

  describe('when customClaims has multiple claims', () => {
    it('should transform all claims', () => {
      const input = [
        {
          inboundTokenClaimName: 'sub',
          inboundTokenClaimValueType: 'STRING',
        },
        {
          inboundTokenClaimName: 'email',
          inboundTokenClaimValueType: 'STRING',
          authorizingClaimMatchValue: {
            claimMatchOperator: 'CONTAINS',
            claimMatchValue: {
              matchValueString: '@company.com',
            },
          },
        },
      ]

      expect(transformCustomClaims(input)).toEqual([
        {
          InboundTokenClaimName: 'sub',
          InboundTokenClaimValueType: 'STRING',
        },
        {
          InboundTokenClaimName: 'email',
          InboundTokenClaimValueType: 'STRING',
          AuthorizingClaimMatchValue: {
            ClaimMatchOperator: 'CONTAINS',
            ClaimMatchValue: {
              MatchValueString: '@company.com',
            },
          },
        },
      ])
    })
  })
})
