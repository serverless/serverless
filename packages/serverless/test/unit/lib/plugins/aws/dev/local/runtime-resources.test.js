import { afterEach, describe, expect, jest, test } from '@jest/globals'
import fs from 'fs'
import { cleanTempDirs, tempDir } from './helpers.js'

// The credentials endpoint is the last resource opened: whether it can listen is up to the test.
let credentialsListen = async () => 'http://127.0.0.1:1'
const credentialsClosed = []
jest.unstable_mockModule(
  '../../../../../../../lib/plugins/aws/dev/local/credentials.js',
  () => ({
    createCredentialsServer: () => {
      const server = {
        listen: () => credentialsListen(),
        close: async () => {
          credentialsClosed.push(server)
        },
      }
      return server
    },
  }),
)
const { openRuntimeResources } =
  await import('../../../../../../../lib/plugins/aws/dev/local/runtime-resources.js')

const options = (tmpRoot) => ({
  tmpRoot,
  pid: process.pid,
  isAlive: () => true,
  randomBytes: (n) => Buffer.alloc(n, 1),
  now: Date.now,
  debug: () => {},
})

afterEach(() => {
  credentialsListen = async () => 'http://127.0.0.1:1'
  credentialsClosed.length = 0
  cleanTempDirs()
})

describe("the laptop runtime's resources", () => {
  test('a start that fails half way leaves on the shared object what it opened, and close() ends all of it', async () => {
    credentialsListen = async () => {
      throw new Error('listen EADDRINUSE')
    }
    const resources = {}
    await expect(
      openRuntimeResources(options(tempDir()), resources),
    ).rejects.toThrow('EADDRINUSE')
    // What opened before the failure is there to be closed.
    expect(fs.existsSync(resources.tmpDir)).toBe(true)
    expect(resources.api.server.listening).toBe(true)
    expect(resources.credentials).toBeDefined()
    await resources.close()
    expect(fs.existsSync(resources.tmpDir)).toBe(false)
    expect(resources.api.server.listening).toBe(false)
    expect(credentialsClosed).toEqual([resources.credentials])
  })

  test('without a shared object it returns a new one that close() ends', async () => {
    const resources = await openRuntimeResources(options(tempDir()))
    expect(Object.keys(resources.configFiles).sort()).toEqual([
      'boto',
      'config',
      'credentials',
    ])
    for (const file of Object.values(resources.configFiles)) {
      expect(fs.readFileSync(file, 'utf8')).toBe('')
    }
    expect(resources.api.server.listening).toBe(true)
    await resources.close()
    expect(fs.existsSync(resources.tmpDir)).toBe(false)
    expect(resources.api.server.listening).toBe(false)
    expect(credentialsClosed).toEqual([resources.credentials])
  })
})
