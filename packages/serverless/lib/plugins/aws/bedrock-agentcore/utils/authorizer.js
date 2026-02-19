'use strict'

/**
 * Utility functions for transforming authorizer configurations.
 *
 * Used by runtime and gateway compilers to transform JWT custom claims
 * from user-friendly camelCase format to CloudFormation PascalCase format.
 */

/**
 * Transform custom claims from camelCase to PascalCase CFN format
 *
 * Input format (serverless.yml):
 *   customClaims:
 *     - inboundTokenClaimName: 'sub'
 *       inboundTokenClaimValueType: 'STRING'
 *       authorizingClaimMatchValue:
 *         claimMatchOperator: 'EQUALS'
 *         claimMatchValue:
 *           matchValueString: 'expected-value'
 *
 * Output format (CloudFormation):
 *   CustomClaims:
 *     - InboundTokenClaimName: 'sub'
 *       InboundTokenClaimValueType: 'STRING'
 *       AuthorizingClaimMatchValue:
 *         ClaimMatchOperator: 'EQUALS'
 *         ClaimMatchValue:
 *           MatchValueString: 'expected-value'
 *
 * @param {Array|undefined} customClaims - Array of custom claim configurations
 * @returns {Array|null} Transformed claims or null if no claims
 */
export function transformCustomClaims(customClaims) {
  if (!customClaims || !Array.isArray(customClaims)) {
    return null
  }

  return customClaims.map((claim) => ({
    InboundTokenClaimName: claim.inboundTokenClaimName,
    InboundTokenClaimValueType: claim.inboundTokenClaimValueType,
    ...(claim.authorizingClaimMatchValue && {
      AuthorizingClaimMatchValue: {
        ClaimMatchOperator: claim.authorizingClaimMatchValue.claimMatchOperator,
        ...(claim.authorizingClaimMatchValue.claimMatchValue && {
          ClaimMatchValue: {
            ...(claim.authorizingClaimMatchValue.claimMatchValue
              .matchValueString && {
              MatchValueString:
                claim.authorizingClaimMatchValue.claimMatchValue
                  .matchValueString,
            }),
            ...(claim.authorizingClaimMatchValue.claimMatchValue
              .matchValueStringList && {
              MatchValueStringList:
                claim.authorizingClaimMatchValue.claimMatchValue
                  .matchValueStringList,
            }),
          },
        }),
      },
    }),
  }))
}
