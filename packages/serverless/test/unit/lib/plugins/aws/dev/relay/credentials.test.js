import { createCredentialCache } from '../../../../../../../lib/plugins/aws/dev/relay/credentials.js'

describe('the credential cache', () => {
  test('current() is the last refresh; a failing refresh keeps the last good credentials', async () => {
    let n = 0
    const cache = createCredentialCache({
      resolve: async () => {
        n += 1
        if (n === 3) throw new Error('Token is expired')
        return { accessKeyId: `AKID${n}`, secretAccessKey: 's' }
      },
    })
    expect(() => cache.current()).toThrow('not read yet')
    expect((await cache.refresh()).accessKeyId).toBe('AKID1')
    expect(cache.current().accessKeyId).toBe('AKID1')
    await cache.refresh()
    await expect(cache.refresh()).rejects.toThrow('Token is expired')
    expect(cache.current().accessKeyId).toBe('AKID2')
  })
})
