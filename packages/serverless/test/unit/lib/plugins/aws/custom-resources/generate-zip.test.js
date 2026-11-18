import { afterAll, describe, expect, it, jest } from '@jest/globals'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import JSZip from 'jszip'

// Isolate the artifacts cache in a temporary home directory
const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'generate-zip-home-'))
// (jest gives each test file a copy of process.env, which os.homedir() ignores),
// and the zip's build directory with it
const homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(homeDir)
const tmpdirSpy = jest.spyOn(os, 'tmpdir').mockReturnValue(homeDir)

const { default: generateZip } =
  await import('../../../../../../lib/plugins/aws/custom-resources/generate-zip.js')

const resourcesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../lib/plugins/aws/custom-resources/resources',
)

describe('generateZip', () => {
  afterAll(async () => {
    homedirSpy.mockRestore()
    tmpdirSpy.mockRestore()
    await fsp.rm(homeDir, { recursive: true, force: true })
  })

  it('ships the current handlers when another version cached its artifact the same day', async () => {
    // An artifact built by another Framework version earlier today, in the
    // date-named cache directory
    const date = new Date()
    const staleZip = new JSZip()
    staleZip.file('event-bridge/lib/permissions.js', 'stale handler')
    await fsp.mkdir(
      path.join(
        homeDir,
        '.serverless/artifacts',
        `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`,
      ),
      { recursive: true },
    )
    await fsp.writeFile(
      path.join(
        homeDir,
        '.serverless/artifacts',
        `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`,
        'custom-resources.zip',
      ),
      await staleZip.generateAsync({ type: 'nodebuffer' }),
    )

    const zipPath = await generateZip()
    expect(
      zipPath.startsWith(path.join(homeDir, '.serverless/artifacts')),
    ).toBe(true)
    const zip = await JSZip.loadAsync(await fsp.readFile(zipPath))

    expect(
      await zip.file('event-bridge/lib/permissions.js').async('string'),
    ).toBe(
      await fsp.readFile(
        path.join(resourcesDir, 'event-bridge/lib/permissions.js'),
        'utf8',
      ),
    )
  })
})
