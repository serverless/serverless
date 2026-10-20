'use strict'

/**
 * The web app's URL as a stack output: `https://` plus the endpoint's domain
 * name.
 *
 * @param {object} params
 * @param {ReturnType<import('./function.js').getWebAppLogicalIds>} params.logicalIds
 */
export function compileUrlOutput({ logicalIds }) {
  return {
    Description: 'Lambda Web Function URL',
    Value: {
      'Fn::Join': [
        '',
        ['https://', { 'Fn::GetAtt': [logicalIds.endpoint, 'DomainName'] }],
      ],
    },
  }
}
