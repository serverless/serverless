import { describe, expect, it } from '@jest/globals'
import { compileUrlOutput } from '../../../../../../../lib/plugins/aws/web-apps/compilers/outputs.js'
import { getWebAppLogicalIds } from '../../../../../../../lib/plugins/aws/web-apps/compilers/function.js'

describe('compileUrlOutput', () => {
  it('is https:// plus the endpoint domain name', () => {
    expect(
      compileUrlOutput({ logicalIds: getWebAppLogicalIds('api') }),
    ).toEqual({
      Description: 'Lambda Web Function URL',
      Value: {
        'Fn::Join': [
          '',
          [
            'https://',
            { 'Fn::GetAtt': ['ApiWebFunctionEndpoint', 'DomainName'] },
          ],
        ],
      },
    })
  })
})
