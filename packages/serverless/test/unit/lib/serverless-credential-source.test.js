import { describe, expect, test } from '@jest/globals'

const { default: Serverless } = await import('../../../lib/serverless.js')

describe('the AWS credential source the CLI runner passes', () => {
  test('is kept as given', () => {
    const source = { source: 'profile', profile: 'ops', resolver: 'awsOps' }
    const serverless = new Serverless({
      commands: [],
      options: {},
      awsCredentialSource: source,
    })
    expect(serverless.awsCredentialSource).toBe(source)
  })

  test('is undefined when none is passed', () => {
    const serverless = new Serverless({ commands: [], options: {} })
    expect(serverless.awsCredentialSource).toBeUndefined()
  })
})
