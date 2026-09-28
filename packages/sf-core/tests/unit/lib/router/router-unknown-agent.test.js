import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { log } from '@serverless/util'
import { getRunner } from '../../../../src/lib/router.js'
import { CoreRunner } from '../../../../src/lib/runners/core/core.js'

// Outside a service, an unknown `agent` subcommand goes to the core runner,
// whose error names the agent commands; any other unknown command still
// reports the missing configuration file.
describe('getRunner outside a service', () => {
  const logger = log.get('test:router-unknown-agent')
  let dir
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'no-service-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('an unknown agent subcommand is handled by the core runner', async () => {
    const { runner } = await getRunner({
      logger,
      command: ['agent', 'bogus'],
      options: {},
      compose: { workingDir: dir },
      versions: {},
    })
    expect(runner).toBeInstanceOf(CoreRunner)
  })

  it('any other unknown command still reports the missing configuration file', async () => {
    await expect(
      getRunner({
        logger,
        command: ['bogus'],
        options: {},
        compose: { workingDir: dir },
        versions: {},
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_FILE_NOT_FOUND' })
  })
})
