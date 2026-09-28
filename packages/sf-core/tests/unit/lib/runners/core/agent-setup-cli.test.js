import { jest } from '@jest/globals'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, writeFile, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

// Smoke tests that spawn the REAL bin, not the runner module: they are the only
// coverage proving `serverless agent setup` completes unauthenticated and
// non-TTY. Every module-level test mocks away the auth/router layers that would
// be the ones to reject, so a regression that reintroduces an auth wall (or a
// TTY-only prompt) on this command would be invisible without these.
const run = promisify(execFile)
const BIN = fileURLToPath(
  new URL('../../../../../bin/sf-core.js', import.meta.url),
)
// macOS: /var/folders symlinks — always realpath tmp dirs (repo-known jest quirk)
const tmp = async () =>
  realpath(await mkdtemp(path.join(tmpdir(), 'agent-setup-')))

// HOME is redirected at a throwaway dir so the run cannot read the developer's
// real ~/.serverlessrc or ~/.aws, and cannot write skills into their real home.
// The blanked credential vars are deliberately '' rather than deleted: the
// detection helpers use truthiness (`if (env.SERVERLESS_LICENSE_KEY)`), so ''
// must read as unset — this pins that behavior too.
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

describe('agent setup CLI (spawned, unauthenticated, non-TTY)', () => {
  jest.setTimeout(60000)

  it('bootstrap mode: empty dir, pristine home', async () => {
    const home = await tmp()
    const cwd = await tmp()
    const { stdout, stderr } = await run(
      process.execPath,
      [BIN, 'agent', 'setup'],
      { cwd, env: env(home) },
    )
    const out = stdout + stderr
    expect(out).toContain('serverless-framework v1')
    expect(out).toContain('service: no serverless.yml in this directory')
    expect(out).toContain('auth: not signed in')
    // Dir + leaf together: proves the real bin names the directory the skill
    // was actually installed into, which the module tests cannot (their
    // fixture gateway is named sls-gateway).
    expect(out).toContain('skills/serverless-framework/SKILL.md now')
  })

  it('project mode: minimal service', async () => {
    const home = await tmp()
    const cwd = await tmp()
    await writeFile(
      path.join(cwd, 'serverless.yml'),
      'service: smoke\nprovider:\n  name: aws\n',
    )
    const { stdout, stderr } = await run(
      process.execPath,
      [BIN, 'agent', 'setup'],
      { cwd, env: env(home) },
    )
    const out = stdout + stderr
    expect(out).toContain('service: serverless.yml found')
    // Project skills are owned by other branches; pin presence and scope, not
    // the version, so a bump elsewhere cannot fail this smoke test.
    expect(out).toMatch(/serverless-mcp v\d+ \(project\)/)
  })

  it('`agent skills install` in an empty dir: user-level skill only, exit 0', async () => {
    const home = await tmp()
    const cwd = await tmp()
    const { stdout, stderr } = await run(
      process.execPath,
      [BIN, 'agent', 'skills', 'install'],
      { cwd, env: env(home) },
    )
    const out = stdout + stderr
    expect(out).toMatch(/serverless-framework v\d+ \(user: ~\//)
    expect(out).toContain('project skills: no serverless.yml in this directory')
    expect(out).not.toContain('serverless-mcp')
  })
})
