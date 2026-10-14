import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import cleanupTempDir from '../../../../../../../lib/plugins/aws/common/lib/cleanup-temp-dir.js'
import Utils from '../../../../../../../lib/classes/utils.js'
import { devModeRanIn } from '../../../../../../../lib/plugins/aws/dev/state/paths.js'

/**
 * `package`, `deploy` (with --package) and `deploy function` empty `<serviceDir>/.serverless`
 * through this step. A Dev Mode session keeps its record in `.serverless/dev/`, which stays.
 */
describe('the .serverless cleanup of package and deploy', () => {
  let serviceDir

  const plugin = () => {
    const serverless = { serviceDir }
    serverless.utils = new Utils(serverless)
    return { serverless, ...cleanupTempDir }
  }
  const write = async (relative, content = 'x') => {
    const file = path.join(serviceDir, relative)
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await fsp.writeFile(file, content)
  }
  const exists = (relative) => fs.existsSync(path.join(serviceDir, relative))

  beforeEach(async () => {
    serviceDir = fs.realpathSync(
      await fsp.mkdtemp(path.join(os.tmpdir(), 'sls-cleanup-')),
    )
    await write('serverless.yml', 'service: s\n')
    await write('.serverless/service.zip')
    await write('.serverless/cloudformation-template-update-stack.json', '{}')
    await write('.serverless/build/handler.js')
  })

  afterEach(async () => {
    await fsp.rm(serviceDir, { recursive: true, force: true })
  })

  it('without .serverless/dev/, removes .serverless itself, as it always has', async () => {
    await plugin().cleanupTempDir()
    expect(exists('.serverless')).toBe(false)
    expect(exists('serverless.yml')).toBe(true)
    expect(devModeRanIn(serviceDir)).toBe(false)
  })

  it('keeps .serverless/dev/ and everything in it, and removes the rest', async () => {
    await write('.serverless/dev/session.json', '{"session_id":"s"}')
    await write('.serverless/dev/control.token', 'token')
    await write('.serverless/dev/session.ndjson', '{}\n')
    await write('.serverless/dev/invocations/api/1-r.json', '{}')
    await plugin().cleanupTempDir()
    expect(fs.readdirSync(path.join(serviceDir, '.serverless'))).toEqual([
      'dev',
    ])
    expect(
      fs.readFileSync(
        path.join(serviceDir, '.serverless/dev/session.json'),
        'utf8',
      ),
    ).toBe('{"session_id":"s"}')
    expect(exists('.serverless/dev/control.token')).toBe(true)
    expect(exists('.serverless/dev/session.ndjson')).toBe(true)
    expect(exists('.serverless/dev/invocations/api/1-r.json')).toBe(true)
    // What the check before the next deploy reads.
    expect(devModeRanIn(serviceDir)).toBe(true)
  })

  it('does nothing without a .serverless directory', async () => {
    await fsp.rm(path.join(serviceDir, '.serverless'), { recursive: true })
    await plugin().cleanupTempDir()
    expect(exists('.serverless')).toBe(false)
  })
})
