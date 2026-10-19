import { ZipArchive } from 'archiver'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { readArchiveEntryNames } from '../../../../lib/utils/read-archive-entry-names.js'

const writeZip = async (zipPath, files, options = {}) => {
  const zip = new ZipArchive(options)
  const output = fs.createWriteStream(zipPath)
  await new Promise((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    zip.pipe(output)
    for (const [name, content] of Object.entries(files)) {
      zip.append(content, { name })
    }
    zip.finalize().catch(reject)
  })
}

describe('readArchiveEntryNames', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-archive-entry-names-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reads the entry names from the central directory', async () => {
    const zipPath = path.join(dir, 'a.zip')
    await writeZip(zipPath, {
      'src/server.js': 'x\n',
      'package.json': '{}\n',
    })

    await expect(readArchiveEntryNames(zipPath)).resolves.toEqual(
      new Set(['src/server.js', 'package.json']),
    )
  })

  it('reads a ZIP64 archive', async () => {
    // archiver switches to ZIP64 past 65535 entries, which a real node_modules
    // clears easily.
    const zipPath = path.join(dir, 'zip64.zip')
    await writeZip(zipPath, { 'src/handler.js': 'x\n' }, { forceZip64: true })

    await expect(readArchiveEntryNames(zipPath)).resolves.toEqual(
      new Set(['src/handler.js']),
    )
  })

  it('returns null for something that is not an archive', async () => {
    const notAZip = path.join(dir, 'not-a-zip.bin')
    fs.writeFileSync(notAZip, 'definitely not a zip file')

    await expect(readArchiveEntryNames(notAZip)).resolves.toBeNull()
  })

  it('returns null for a file that does not exist', async () => {
    await expect(
      readArchiveEntryNames(path.join(dir, 'nope.zip')),
    ).resolves.toBeNull()
  })
})
