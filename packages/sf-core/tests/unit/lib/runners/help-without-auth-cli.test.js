import { jest } from '@jest/globals'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { access, mkdtemp, readdir, realpath, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { TraditionalRunner } from '../../../../src/lib/runners/framework.js'

// Spawns the REAL bin, signed out, in a service directory: help for a
// built-in command must print without sign-in, and nothing about asking for
// help may run the product. The service carries tripwires -- a handler and a
// local plugin that each write a marker file when executed -- so a help path
// that ran the command, resolved variables into AWS calls, or loaded plugins
// would leave evidence.
const run = promisify(execFile)
const BIN = fileURLToPath(
  new URL('../../../../bin/sf-core.js', import.meta.url),
)
const tmp = async (prefix) =>
  realpath(await mkdtemp(path.join(tmpdir(), prefix)))
const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  )

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

const makeService = async () => {
  const dir = await tmp('help-svc-')
  await writeFile(
    path.join(dir, 'serverless.yml'),
    [
      'service: help-gate',
      "frameworkVersion: '4'",
      'plugins:',
      '  - ./tripwire-plugin.cjs',
      'provider:',
      '  name: aws',
      '  runtime: nodejs22.x',
      // Would need AWS (and credentials) if variables were resolved.
      '  environment:',
      '    SECRET: ${ssm:/help-gate/never-resolved}',
      'functions:',
      '  hello:',
      '    handler: handler.hello',
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(dir, 'handler.mjs'),
    "import { writeFileSync } from 'fs'\nexport const hello = async () => { writeFileSync(new URL('./HANDLER_RAN', import.meta.url), 'x'); return { ok: true } }\n",
  )
  await writeFile(
    path.join(dir, 'tripwire-plugin.cjs'),
    "const fs = require('fs'); const path = require('path')\nmodule.exports = class Tripwire { constructor() { fs.writeFileSync(path.join(__dirname, 'PLUGIN_LOADED'), 'x'); this.commands = { tripwire: { usage: 'plugin command', lifecycleEvents: ['run'] } } } }\n",
  )
  return dir
}

const serverless = async (cwd, home, args) =>
  run(process.execPath, [BIN, ...args], {
    cwd,
    env: env(home),
    timeout: 60000,
  }).then(
    ({ stdout, stderr }) => ({ code: 0, out: stdout + stderr, stdout }),
    (e) => ({ code: e.code, out: e.stdout + e.stderr, stdout: e.stdout }),
  )

describe('help without sign-in (spawned, non-TTY, service directory)', () => {
  jest.setTimeout(120000)

  let home
  beforeEach(async () => {
    home = await tmp('help-home-')
  })

  const expectNoTripwires = async (dir) => {
    expect(await exists(path.join(dir, 'HANDLER_RAN'))).toBe(false)
    expect(await exists(path.join(dir, 'PLUGIN_LOADED'))).toBe(false)
  }
  // Help also writes nothing: no .serverless/ (meta.json, packages, state).
  // Gated commands still write meta.json on the way out, as before.
  const expectNothingWritten = async (dir) =>
    expect(await readdir(dir)).not.toContain('.serverless')

  it.each([
    [['deploy', '--help']],
    [['deploy', '-h']],
    [['print', '--help']],
    [['invoke', 'local', '--help']],
    [['deploy', 'function', '--help']],
  ])(
    '`serverless %j` prints the command help, exit 0, and runs nothing',
    async (args) => {
      const dir = await makeService()
      const { code, out, stdout } = await serverless(dir, home, args)
      expect(code).toBe(0)
      expect(stdout).toContain(args.filter((a) => !a.startsWith('-')).join(' '))
      expect(out).not.toContain('You must sign in')
      await expectNoTripwires(dir)
      await expectNothingWritten(dir)
    },
  )

  it.each([[['--help']], [['-h']], [['help']]])(
    '`serverless %j` prints the general help without loading plugins',
    async (args) => {
      const dir = await makeService()
      const { code, out, stdout } = await serverless(dir, home, args)
      expect(code).toBe(0)
      expect(stdout).toContain('deploy')
      expect(out).toContain(
        'Commands and options added by this service\'s plugins are listed once you sign in ("serverless login").',
      )
      expect(out).not.toContain('You must sign in')
      await expectNoTripwires(dir)
      await expectNothingWritten(dir)
    },
  )

  it('the gate still applies to the command itself', async () => {
    const dir = await makeService()
    const { code, out } = await serverless(dir, home, ['deploy'])
    expect(code).toBe(1)
    expect(out).toContain('You must sign in')
    await expectNoTripwires(dir)
  })

  it('invoke local without --help is still gated and does not run the handler', async () => {
    const dir = await makeService()
    const { code, out } = await serverless(dir, home, [
      'invoke',
      'local',
      '-f',
      'hello',
    ])
    expect(code).toBe(1)
    expect(out).toContain('You must sign in')
    await expectNoTripwires(dir)
  })

  it('help for a plugin command is still gated, and the plugin is not loaded', async () => {
    const dir = await makeService()
    const { code, out } = await serverless(dir, home, ['tripwire', '--help'])
    expect(code).toBe(1)
    expect(out).toContain('You must sign in')
    await expectNoTripwires(dir)
  })
})

// The signed-in path is unchanged: renderHelpBeforeAuth declines, and the
// runner renders help as before (including what the service's plugins add).
describe('renderHelpBeforeAuth', () => {
  const call = (command, options, state, findSsmLicenseKey = async () => {}) =>
    TraditionalRunner.prototype.renderHelpBeforeAuth.call(
      { command, options, config: {}, versionFramework: '4.0.0' },
      { detectAuth: async () => ({ state }), findSsmLicenseKey },
    )

  // Detection cannot see a License Key kept in SSM; with one, help keeps the
  // usual path, which signs in and lists the plugins' commands.
  it('declines when detection finds nothing but SSM has a License Key', async () => {
    const found = jest.fn(async () => 'license-key-from-ssm')
    expect(await call(['deploy'], { help: true }, 'none', found)).toBe(false)
    expect(found).toHaveBeenCalledTimes(1)
  })

  it('looks in SSM only when detection finds nothing', async () => {
    const found = jest.fn(async () => 'license-key-from-ssm')
    expect(await call(['deploy'], { help: true }, 'rc-user', found)).toBe(false)
    expect(found).not.toHaveBeenCalled()
  })

  it.each(['rc-user', 'env-access', 'env-license'])(
    'declines when auth is %s, so help keeps the usual path',
    async (state) => {
      expect(await call(['deploy'], { help: true }, state)).toBe(false)
      expect(await call([], { h: true }, state)).toBe(false)
    },
  )

  it('declines without a help flag or the help command', async () => {
    expect(await call(['deploy'], {}, 'none')).toBe(false)
    expect(await call(['deploy'], { help: false }, 'none')).toBe(false)
  })

  it('declines for a command the static schema does not know', async () => {
    expect(await call(['tripwire'], { help: true }, 'none')).toBe(false)
    expect(await call(['deploy', 'nonsense'], { help: true }, 'none')).toBe(
      false,
    )
  })
})
