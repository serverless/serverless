import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { log } from '@serverless/util'
import { getRunner } from '../../../../src/lib/router.js'
import {
  CoreRunner,
  isDevSetup,
} from '../../../../src/lib/runners/core/core.js'

// `dev setup` sets up an AWS account and region, not a service: outside a service directory the
// core runner takes it. Every other `dev` command still needs the service's configuration.
describe('getRunner and dev setup', () => {
  const logger = log.get('test:router-dev-setup')
  let dir
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'sls-dev-t-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  const runnerFor = (command, options = {}) =>
    getRunner({
      logger,
      command,
      options,
      compose: { workingDir: dir },
      versions: {},
    })

  it('outside a service, dev setup is handled by the core runner', async () => {
    const { runner } = await runnerFor(['dev', 'setup'])
    expect(runner).toBeInstanceOf(CoreRunner)
  })

  it.each([[['dev']], [['dev', 'restore']], [['dev', 'stop']]])(
    'outside a service, %p still reports the missing configuration file',
    async (command) => {
      await expect(runnerFor(command)).rejects.toMatchObject({
        code: 'CONFIG_FILE_NOT_FOUND',
      })
    },
  )

  it.each([
    ['--config', { config: 'missing.yml' }],
    ['-c', { c: 'missing.yml' }],
  ])(
    'outside a service, dev setup %s naming a file that is not there reports it missing',
    async (_, options) => {
      await expect(runnerFor(['dev', 'setup'], options)).rejects.toMatchObject({
        code: 'CONFIG_FILE_NOT_FOUND',
      })
    },
  )

  it('next to a configuration of a framework the CLI no longer supports, dev setup says so', async () => {
    await writeFile(path.join(dir, 'serverless.ai.yml'), 'name: agent\n')
    await expect(runnerFor(['dev', 'setup'])).rejects.toMatchObject({
      code: 'FRAMEWORK_SUPPORT_REMOVED',
    })
  })

  it('inside a service, dev setup stays with the Framework', async () => {
    await writeFile(
      path.join(dir, 'serverless.yml'),
      'service: acme\nprovider:\n  name: aws\n  runtime: nodejs24.x\n',
    )
    const { runner } = await runnerFor(['dev', 'setup'])
    expect(runner).not.toBeInstanceOf(CoreRunner)
  })

  // Accepted: a Compose project root is not "outside a service"; Compose answers as before.
  it('next to a serverless-compose.yml only, dev setup stays with Compose', async () => {
    await mkdir(path.join(dir, 'api'))
    await writeFile(
      path.join(dir, 'api', 'serverless.yml'),
      'service: api\nprovider:\n  name: aws\n  runtime: nodejs24.x\n',
    )
    await writeFile(
      path.join(dir, 'serverless-compose.yml'),
      'services:\n  api:\n    path: api\n',
    )
    const { runner } = await runnerFor(['dev', 'setup'])
    expect(runner).not.toBeInstanceOf(CoreRunner)
  })

  it('isDevSetup names only dev setup', () => {
    expect(isDevSetup(['dev', 'setup'])).toBe(true)
    expect(isDevSetup(['dev'])).toBe(false)
    expect(isDevSetup(['dev', 'stop'])).toBe(false)
    expect(isDevSetup(undefined)).toBe(false)
  })
})
