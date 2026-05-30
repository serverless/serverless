import { buildApiKeyStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/api-key-store.js'

function makeServerless(apiKeys) {
  return {
    service: {
      provider: apiKeys === undefined ? {} : { apiGateway: { apiKeys } },
    },
  }
}

describe('buildApiKeyStore', () => {
  it('produces an empty store when no keys are configured (no default key)', () => {
    const { keys } = buildApiKeyStore(makeServerless())
    expect(keys.size).toBe(0)
    expect(keys.has('d41d8cd98f00b204e9800998ecf8427e')).toBe(false)
  })

  it('returns the configured string keys', () => {
    const { keys } = buildApiKeyStore(makeServerless(['key-one', 'key-two']))
    expect(keys.size).toBe(2)
    expect(keys.has('key-one')).toBe(true)
    expect(keys.has('key-two')).toBe(true)
  })

  it('extracts the value from the object form { name, value }', () => {
    const { keys } = buildApiKeyStore(
      makeServerless([{ name: 'prod-key', value: 'p-secret' }, 'literal-key']),
    )
    expect(keys.has('p-secret')).toBe(true)
    expect(keys.has('literal-key')).toBe(true)
  })

  it('produces an empty store when apiKeys is an empty array', () => {
    const { keys } = buildApiKeyStore(makeServerless([]))
    expect(keys.size).toBe(0)
  })

  it('handles serverless without provider gracefully', () => {
    const { keys } = buildApiKeyStore({ service: {} })
    expect(keys.size).toBe(0)
  })
})
