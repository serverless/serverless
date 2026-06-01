import { buildAwsEndpoint } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/aws-proxy.js'

describe('buildAwsEndpoint', () => {
  it('builds the standard regional endpoint', () => {
    expect(buildAwsEndpoint('dynamodb', 'us-east-1')).toBe(
      'https://dynamodb.us-east-1.amazonaws.com',
    )
    expect(buildAwsEndpoint('secretsmanager', 'eu-west-1')).toBe(
      'https://secretsmanager.eu-west-1.amazonaws.com',
    )
  })

  it('returns null when service or region is missing', () => {
    expect(buildAwsEndpoint('', 'us-east-1')).toBeNull()
    expect(buildAwsEndpoint('dynamodb', '')).toBeNull()
  })
})
