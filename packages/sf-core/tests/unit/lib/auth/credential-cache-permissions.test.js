import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { AwsLogin } from '../../../../src/lib/auth/aws-login.js'
import { AwsSsoLogin } from '../../../../src/lib/auth/aws-sso-login.js'

// POSIX permission bits are not meaningful on Windows.
const itPosix = process.platform === 'win32' ? it.skip : it

const modeOf = (target) =>
  (typeof target === 'number' ? fs.fstatSync(target) : fs.statSync(target))
    .mode & 0o777

const loginTokens = {
  accessToken: {
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret',
    sessionToken: 'session',
  },
  tokenType: 'urn:aws:params:oauth:token-type:access_token_sigv4',
  refreshToken: 'refresh',
  idToken: 'id',
  dpopKey: 'key',
  expiresIn: 900,
}
const sessionId = 'arn:aws:iam::123456789012:user/example'

const ssoRegistration = {
  clientId: 'client',
  clientSecret: 'client-secret',
  expiresAt: '2030-01-01T00:00:00Z',
  scopes: ['sso:account:access'],
  grantTypes: ['authorization_code', 'refresh_token'],
}
const ssoToken = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresIn: 3600,
}

const writers = [
  {
    name: 'login aws token',
    cacheDir: (home) => path.join(home, '.aws', 'login', 'cache'),
    write: () => new AwsLogin().saveToken(sessionId, loginTokens),
  },
  {
    name: 'login aws sso registration',
    cacheDir: (home) => path.join(home, '.aws', 'sso', 'cache'),
    write: () =>
      new AwsSsoLogin().saveRegistration(
        'https://example.awsapps.com/start',
        'us-east-1',
        'session',
        ssoRegistration.scopes,
        ssoRegistration,
      ),
  },
  {
    name: 'login aws sso token',
    cacheDir: (home) => path.join(home, '.aws', 'sso', 'cache'),
    write: () =>
      new AwsSsoLogin().saveToken(
        'https://example.awsapps.com/start',
        'us-east-1',
        'session',
        ssoRegistration,
        ssoToken,
      ),
  },
]

describe('AWS credential cache files', () => {
  let home
  let previousUmask
  let writes

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-cred-cache-'))
    jest.spyOn(os, 'homedir').mockReturnValue(home)
    // A common default umask, under which a plain write creates 0644 files.
    previousUmask = process.umask(0o022)

    // Record each file's permissions right after its contents are written,
    // before any later permission change can hide a readable window.
    writes = []
    const writeFileSync = fs.writeFileSync
    jest.spyOn(fs, 'writeFileSync').mockImplementation((target, ...args) => {
      const result = writeFileSync(target, ...args)
      writes.push(modeOf(target))
      return result
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.umask(previousUmask)
    fs.rmSync(home, { recursive: true, force: true })
  })

  describe.each(writers)('$name', ({ cacheDir, write }) => {
    itPosix('is readable only by the owner when its contents land', () => {
      write()

      expect(writes).toEqual([0o600])
      const [file] = fs.readdirSync(cacheDir(home))
      expect(modeOf(path.join(cacheDir(home), file))).toBe(0o600)
    })

    itPosix(
      'restricts an existing, more permissive file before rewriting it',
      () => {
        write()
        const [file] = fs.readdirSync(cacheDir(home))
        const filePath = path.join(cacheDir(home), file)
        fs.chmodSync(filePath, 0o644)
        writes = []

        write()

        expect(writes).toEqual([0o600])
        expect(modeOf(filePath)).toBe(0o600)
      },
    )

    it('stores the cache contents as JSON', () => {
      write()

      const [file] = fs.readdirSync(cacheDir(home))
      const content = JSON.parse(
        fs.readFileSync(path.join(cacheDir(home), file), 'utf8'),
      )
      expect(content).toEqual(expect.any(Object))
    })
  })
})
