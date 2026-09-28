import { jest } from '@jest/globals'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, writeFile, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

// Spawns the REAL bin: the module tests fake the auth layer, so only a spawned
// run proves that `serverless login` in a non-TTY with an existing session
// prints the session as a success line and exits 0 instead of exiting silently, and that the
// auth gate on an ordinary command prints its guidance without a stack trace.
// The no-session path is not spawned here because it contacts the login
// broker; it is covered by the module tests.
const run = promisify(execFile)
const BIN = fileURLToPath(
  new URL('../../../../../bin/sf-core.js', import.meta.url),
)
const tmp = async () => realpath(await mkdtemp(path.join(tmpdir(), 'login-')))
const env = (home) => ({
  ...process.env,
  HOME: home,
  // os.homedir() reads USERPROFILE on Windows, not HOME.
  USERPROFILE: home,
  SERVERLESS_PLATFORM_STAGE: 'dev',
  SERVERLESS_LICENSE_KEY: '',
  SERVERLESS_ACCESS_KEY: '',
  AWS_ACCESS_KEY_ID: '',
  AWS_SECRET_ACCESS_KEY: '',
  AWS_PROFILE: '',
})

describe('login CLI (spawned, non-TTY)', () => {
  jest.setTimeout(60000)

  // The saved session is checked the way every command checks it. This one
  // has no refresh token, so it fails with the same session error a deploy
  // would give, instead of being reported as signed in.
  it('a saved session that cannot sign in: the sign-in error, exit 1', async () => {
    const home = await tmp()
    await writeFile(
      // The stage is 'dev', and the rc file name carries the stage: .serverlessdevrc.
      path.join(home, '.serverlessdevrc'),
      JSON.stringify({
        userId: 'u1',
        users: {
          u1: {
            userId: 'u1',
            username: 'tester',
            defaultOrgName: 'acme',
            dashboard: { idToken: 'x', accessKeys: { acme: 'k' } },
          },
        },
      }),
    )
    const error = await run(process.execPath, [BIN, 'login'], {
      cwd: await tmp(),
      env: env(home),
      // A session that is not detected falls into the browser flow and waits
      // ten minutes; fail fast instead so a regression is visible.
      timeout: 30000,
    }).catch((e) => e)
    expect(error.code).toBe(1)
    expect(error.stderr).toContain('There is an error with your User session')
    expect(error.stderr).not.toContain('Already signed in')
  })

  it('auth gate on an ordinary command: guidance, no stack trace, exit 1', async () => {
    const home = await tmp()
    const cwd = await tmp()
    await writeFile(
      path.join(cwd, 'serverless.yml'),
      'service: gate\nprovider:\n  name: aws\n',
    )
    const error = await run(process.execPath, [BIN, 'print'], {
      cwd,
      env: env(home),
      timeout: 30000,
    }).catch((e) => e)
    expect(error.code).toBe(1)
    const out = error.stdout + error.stderr
    expect(out).toContain('run "serverless login"')
    expect(out).toContain('https://app.serverless.com/settings/accessKeys')
    expect(out).toContain('SERVERLESS_ACCESS_KEY')
    expect(out).not.toMatch(/^\s+at /m)
  })

  it('`login --help` lists --org, and `login aws --help` does not', async () => {
    const home = await tmp()
    const help = async (args) =>
      (
        await run(process.execPath, [BIN, ...args, '--help'], {
          cwd: home,
          env: env(home),
          timeout: 30000,
        })
      ).stdout
    expect(await help(['login'])).toMatch(/--org\s+Make this org the default/)
    expect(await help(['login', 'aws'])).not.toContain('--org')
  })

  it('`login --org` with an env key: the option parses, and the error says why it does not apply', async () => {
    const home = await tmp()
    const error = await run(process.execPath, [BIN, 'login', '--org', 'beta'], {
      cwd: home,
      env: { ...env(home), SERVERLESS_ACCESS_KEY: 'test-key-not-real' },
      timeout: 30000,
    }).catch((e) => e)
    expect(error.code).toBe(1)
    const out = error.stdout + error.stderr
    expect(out).toContain(
      'SERVERLESS_ACCESS_KEY is set, and it belongs to a single org, so --org has nothing to change.',
    )
    expect(out).not.toMatch(/^\s+at /m)
  })
})
