import { jest } from '@jest/globals'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadCustomAuthenticationProvider } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/custom-auth-loader.js'

/**
 * Build a serverless-shaped stub with a `serviceDir` and optional
 * `custom.serverless-offline.customAuthenticationProvider` value.
 *
 * @param {string} serviceDir
 * @param {string | undefined} providerPath
 */
function makeServerless(serviceDir, providerPath) {
  return {
    serviceDir,
    service: {
      custom: {
        'serverless-offline':
          providerPath === undefined
            ? {}
            : { customAuthenticationProvider: providerPath },
      },
    },
  }
}

/**
 * Create a temp dir + write a user-side custom-auth file into it.
 * Returns the temp dir for use as `serviceDir`.
 */
async function makeFixture(fileName, contents) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'offline-m3b2-'))
  // Mark the fixture as ESM so Node's loader accepts `export` syntax in .js files.
  await fs.writeFile(path.join(dir, 'package.json'), '{"type":"module"}')
  await fs.writeFile(path.join(dir, fileName), contents)
  return dir
}

describe('loadCustomAuthenticationProvider', () => {
  it('returns null when custom.serverless-offline.customAuthenticationProvider is not configured', async () => {
    const result = await loadCustomAuthenticationProvider({
      serverless: makeServerless('/tmp/anything', undefined),
    })
    expect(result).toBeNull()
  })

  it('returns null when the custom.serverless-offline block is entirely absent', async () => {
    const result = await loadCustomAuthenticationProvider({
      serverless: { serviceDir: '/tmp/anything', service: {} },
    })
    expect(result).toBeNull()
  })

  it('loads the file, invokes the default-export factory, returns the strategy', async () => {
    const dir = await makeFixture(
      'auth.js',
      `
      export default function provider(endpoint, fnKey, method, path) {
        return {
          name: 'my-auth',
          scheme: 'my-scheme',
          getAuthenticateFunction: () => ({
            authenticate(request, h) {
              return h.authenticated({ credentials: {} })
            },
          }),
        }
      }
      `,
    )
    const result = await loadCustomAuthenticationProvider({
      serverless: makeServerless(dir, 'auth.js'),
    })
    expect(result.name).toBe('my-auth')
    expect(result.scheme).toBe('my-scheme')
    expect(typeof result.getAuthenticateFunction).toBe('function')
  })

  it('calls the factory exactly once with (null, null, null, null)', async () => {
    const dir = await makeFixture(
      'spy-auth.js',
      `
      let callCount = 0
      let receivedArgs = []
      export default function provider(...args) {
        callCount += 1
        receivedArgs = args
        return {
          name: 'spied',
          scheme: 'spied-scheme',
          getAuthenticateFunction: () => ({ authenticate() {} }),
          // Expose for assertion via a side-channel on the returned object:
          __callCount: () => callCount,
          __args: () => receivedArgs,
        }
      }
      `,
    )
    const result = await loadCustomAuthenticationProvider({
      serverless: makeServerless(dir, 'spy-auth.js'),
    })
    expect(result.__callCount()).toBe(1)
    expect(result.__args()).toEqual([null, null, null, null])
  })

  it('resolves the path relative to serverless.serviceDir', async () => {
    const dir = await makeFixture(
      'subdir-auth.js',
      `
      export default () => ({
        name: 'sub',
        scheme: 'sub-scheme',
        getAuthenticateFunction: () => ({ authenticate() {} }),
      })
      `,
    )
    // Move the file into a subdir to prove resolution honors the relative path.
    await fs.mkdir(path.join(dir, 'auth'))
    await fs.rename(
      path.join(dir, 'subdir-auth.js'),
      path.join(dir, 'auth', 'index.js'),
    )
    const result = await loadCustomAuthenticationProvider({
      serverless: makeServerless(dir, 'auth/index.js'),
    })
    expect(result.name).toBe('sub')
  })

  it('throws OFFLINE_CUSTOM_AUTH_LOAD_FAILED when the file does not exist', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'offline-m3b2-'))
    let caught
    try {
      await loadCustomAuthenticationProvider({
        serverless: makeServerless(dir, 'missing.js'),
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.code).toBe('OFFLINE_CUSTOM_AUTH_LOAD_FAILED')
  })

  it('throws OFFLINE_CUSTOM_AUTH_LOAD_FAILED when the default export is not a function', async () => {
    const dir = await makeFixture(
      'not-a-factory.js',
      `export default { not: 'a function' }`,
    )
    let caught
    try {
      await loadCustomAuthenticationProvider({
        serverless: makeServerless(dir, 'not-a-factory.js'),
      })
    } catch (err) {
      caught = err
    }
    expect(caught.code).toBe('OFFLINE_CUSTOM_AUTH_LOAD_FAILED')
    expect(caught.message).toMatch(/factory function/i)
  })

  it('throws OFFLINE_CUSTOM_AUTH_LOAD_FAILED when the factory returns an invalid shape', async () => {
    const dir = await makeFixture(
      'bad-return.js',
      `export default () => ({ name: 'x' /* missing scheme + getAuthenticateFunction */ })`,
    )
    let caught
    try {
      await loadCustomAuthenticationProvider({
        serverless: makeServerless(dir, 'bad-return.js'),
      })
    } catch (err) {
      caught = err
    }
    expect(caught.code).toBe('OFFLINE_CUSTOM_AUTH_LOAD_FAILED')
    expect(caught.message).toMatch(/name|scheme|getAuthenticateFunction/i)
  })

  it('accepts a module whose top-level export itself is the factory (no default key)', async () => {
    // CJS-style files seen via Node's ESM loader expose module.exports as
    // both default and the module itself. Some users write
    // `module.exports = function (e, f, m, p) { ... }`.
    const dir = await makeFixture(
      'cjs-style.cjs',
      `module.exports = function (endpoint, fnKey, method, path) {
        return {
          name: 'cjs-auth',
          scheme: 'cjs-scheme',
          getAuthenticateFunction: () => ({ authenticate() {} }),
        }
      }`,
    )
    const result = await loadCustomAuthenticationProvider({
      serverless: makeServerless(dir, 'cjs-style.cjs'),
    })
    expect(result.name).toBe('cjs-auth')
  })
})
