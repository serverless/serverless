import { buildApiKeyStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/api-key-store.js'

function makeServerless(apiKeys) {
  return {
    service: {
      provider: apiKeys === undefined ? {} : { apiGateway: { apiKeys } },
    },
  }
}

describe('buildApiKeyStore', () => {
  it('generates one random key with generated: true when no keys are configured', () => {
    const { keys, generated } = buildApiKeyStore(makeServerless())
    expect(generated).toBe(true)
    expect(keys.size).toBe(1)
    // NOT the plugin's constant md5-of-empty — we emit a unique random key.
    expect(keys.has('d41d8cd98f00b204e9800998ecf8427e')).toBe(false)
    const [key] = keys
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
  })

  it('generates a DIFFERENT key on each call (random, not constant)', () => {
    const [a] = buildApiKeyStore(makeServerless()).keys
    const [b] = buildApiKeyStore(makeServerless()).keys
    expect(a).not.toBe(b)
  })

  it('returns the configured string keys with generated: false', () => {
    const { keys, generated } = buildApiKeyStore(
      makeServerless(['key-one', 'key-two']),
    )
    expect(generated).toBe(false)
    expect(keys.size).toBe(2)
    expect(keys.has('key-one')).toBe(true)
    expect(keys.has('key-two')).toBe(true)
  })

  it('extracts the value from the object form { name, value }', () => {
    const { keys, generated } = buildApiKeyStore(
      makeServerless([{ name: 'prod-key', value: 'p-secret' }, 'literal-key']),
    )
    expect(generated).toBe(false)
    expect(keys.has('p-secret')).toBe(true)
    expect(keys.has('literal-key')).toBe(true)
  })

  it('generates a key when apiKeys is an empty array', () => {
    const { keys, generated } = buildApiKeyStore(makeServerless([]))
    expect(generated).toBe(true)
    expect(keys.size).toBe(1)
  })

  it('handles serverless without provider gracefully (generates a key)', () => {
    const { keys, generated } = buildApiKeyStore({ service: {} })
    expect(generated).toBe(true)
    expect(keys.size).toBe(1)
  })
})
