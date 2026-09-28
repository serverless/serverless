import { jest } from '@jest/globals'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, realpath, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

// Smoke tests that spawn the REAL bin, not the runner module: they are the only
// coverage proving `serverless agent docs` and `serverless agent skills` work
// unauthenticated and non-TTY, against the docs and skills the CLI actually
// resolves at runtime. Every module-level test injects a fixture docs dir and a
// `write` seam, and mocks away the auth/router layers that would be the ones to
// reject, so a regression that reintroduces an auth wall, or that resolves a
// different (or no) docs directory in a real install, would be invisible
// without these.
const run = promisify(execFile)
const BIN = fileURLToPath(
  new URL('../../../../../bin/sf-core.js', import.meta.url),
)
// macOS: /var/folders symlinks — always realpath tmp dirs (repo-known jest quirk)
const tmp = async () =>
  realpath(await mkdtemp(path.join(tmpdir(), 'agent-docs-')))

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

// `bin/sf-core.js` imports `bin/blankLine.js`, which unconditionally writes one
// blank line to stdout before any command runs. That prelude is not the
// runner's output, so the spawned-bin expectations below pin it explicitly
// rather than trimming it away: if it ever moves, these tests should say so.
const PRELUDE = '\n'

describe('agent docs / skills CLI (spawned, unauthenticated, non-TTY, empty dir)', () => {
  jest.setTimeout(60000)

  it('agent docs prints the index on stdout', async () => {
    const home = await tmp()
    const cwd = await tmp()
    const { stdout } = await run(process.execPath, [BIN, 'agent', 'docs'], {
      cwd,
      env: env(home),
    })
    expect(stdout.startsWith(PRELUDE)).toBe(true)
    expect(stdout.slice(PRELUDE.length).split('\n')[0]).toBe(
      'Serverless Framework documentation. Read a page: serverless agent docs <path> [<path> ...]',
    )
    expect(stdout).toContain('\nGet Started\n')
    expect(stdout).toContain('providers/aws/cli-reference/agent-setup')
  })

  it('agent docs <path> prints the stripped page on stdout', async () => {
    const home = await tmp()
    const cwd = await tmp()
    const { stdout } = await run(
      process.execPath,
      [BIN, 'agent', 'docs', 'providers/aws/events/schedule'],
      { cwd, env: env(home) },
    )
    expect(stdout.startsWith(`${PRELUDE}# `)).toBe(true)
    expect(stdout).not.toContain('DOCS-SITE-LINK')
  })

  it('agent docs <unknown> exits 1 with suggestions and no stack trace', async () => {
    const home = await tmp()
    const cwd = await tmp()
    await expect(
      run(process.execPath, [BIN, 'agent', 'docs', 'guides/nope'], {
        cwd,
        env: env(home),
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'Page "guides/nope" not found. Pages under "guides":',
      ),
    })
    const err = await run(
      process.execPath,
      [BIN, 'agent', 'docs', 'guides/nope'],
      { cwd, env: env(home) },
    ).catch((e) => e)
    expect(err.stderr).not.toMatch(/\n\s+at /)
  })

  // The two cases below are the "works anywhere" promise: an agent reaches for
  // the docs precisely when the service config is broken, so routing these
  // commands must never depend on reading -- let alone resolving -- it.
  it('agent docs works in a service whose provider.stage cannot resolve', async () => {
    const home = await tmp()
    const cwd = await tmp()
    await writeFile(
      path.join(cwd, 'serverless.yml'),
      'service: broken\nprovider:\n  name: aws\n  stage: ${env:AGENT_DOCS_TEST_UNSET_VAR}\n',
    )
    const { stdout, stderr } = await run(
      process.execPath,
      [BIN, 'agent', 'docs', 'getting-started'],
      { cwd, env: env(home) },
    )
    expect(stdout.startsWith(`${PRELUDE}# `)).toBe(true)
    expect(stderr).not.toContain('Cannot resolve')
  })

  it('agent skills works in a service whose serverless.yml cannot be parsed', async () => {
    const home = await tmp()
    const cwd = await tmp()
    await writeFile(
      path.join(cwd, 'serverless.yml'),
      'service: [unterminated\n',
    )
    const { stdout } = await run(
      process.execPath,
      [BIN, 'agent', 'skills', 'list'],
      { cwd, env: env(home) },
    )
    expect(stdout).toMatch(/^serverless-framework\s+v1\s+user\s+/m)
  })

  it('agent skills (bare) lists the bundled skills; read prints one', async () => {
    const home = await tmp()
    const cwd = await tmp()
    const list = await run(process.execPath, [BIN, 'agent', 'skills'], {
      cwd,
      env: env(home),
    })
    expect(list.stdout).toMatch(/^serverless-framework\s+v1\s+user\s+/m)
    const read = await run(
      process.execPath,
      [BIN, 'agent', 'skills', 'read', 'serverless-framework'],
      { cwd, env: env(home) },
    )
    // The skill prints as checked out, which is CRLF on a Windows runner.
    expect(
      read.stdout
        .replace(/\r\n/g, '\n')
        .startsWith(`${PRELUDE}---\nname: serverless-framework`),
    ).toBe(true)
    expect(read.stdout).toContain('files: references/')
  })
})
