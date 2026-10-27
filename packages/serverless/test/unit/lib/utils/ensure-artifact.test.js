import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'

// Isolate the artifacts cache in a temporary home directory
const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-artifact-home-'))
// (jest gives each test file a copy of process.env, which os.homedir() ignores)
const homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(homeDir)

const { default: ensureArtifact } =
  await import('../../../../lib/utils/ensure-artifact.js')

const writeSource = async (name, files) => {
  const dir = path.join(homeDir, 'sources', name)
  for (const [file, content] of Object.entries(files)) {
    await fsp.mkdir(path.dirname(path.join(dir, file)), { recursive: true })
    await fsp.writeFile(path.join(dir, file), content)
  }
  return dir
}

// Builds the artifact as a copy of the source's handler file
const generateFrom = (sourceDir) =>
  jest.fn(async (cachePath) => {
    await fsp.copyFile(
      path.join(sourceDir, 'handler.js'),
      path.join(cachePath, 'artifact.txt'),
    )
  })

const readArtifact = async (cachePath) =>
  fsp.readFile(path.join(cachePath, 'artifact.txt'), 'utf8')

describe('ensureArtifact', () => {
  let releasedSource
  let changedSource

  beforeAll(async () => {
    releasedSource = await writeSource('released', {
      'handler.js': 'released handler',
      'lib/utils.js': 'utils',
    })
    changedSource = await writeSource('changed', {
      'handler.js': 'changed handler',
      'lib/utils.js': 'utils',
    })
  })

  afterAll(async () => {
    homedirSpy.mockRestore()
    await fsp.rm(homeDir, { recursive: true, force: true })
  })

  it('caches artifacts built from different source contents separately', async () => {
    const generateReleased = generateFrom(releasedSource)
    const generateChanged = generateFrom(changedSource)

    const releasedCachePath = await ensureArtifact(
      'artifact.txt',
      releasedSource,
      generateReleased,
    )
    const changedCachePath = await ensureArtifact(
      'artifact.txt',
      changedSource,
      generateChanged,
    )

    expect(changedCachePath).not.toBe(releasedCachePath)
    expect(generateReleased).toHaveBeenCalledTimes(1)
    expect(generateChanged).toHaveBeenCalledTimes(1)
    expect(await readArtifact(releasedCachePath)).toBe('released handler')
    expect(await readArtifact(changedCachePath)).toBe('changed handler')
    for (const cachePath of [releasedCachePath, changedCachePath]) {
      expect(path.dirname(cachePath)).toBe(
        path.join(homeDir, '.serverless', 'artifacts'),
      )
    }
  })

  it('reuses the artifact built from the same source contents', async () => {
    const copiedSource = await writeSource('copied', {
      'handler.js': 'released handler',
      'lib/utils.js': 'utils',
    })
    const generateCopied = generateFrom(copiedSource)

    const releasedCachePath = await ensureArtifact(
      'artifact.txt',
      releasedSource,
      generateFrom(releasedSource),
    )
    const copiedCachePath = await ensureArtifact(
      'artifact.txt',
      copiedSource,
      generateCopied,
    )

    expect(copiedCachePath).toBe(releasedCachePath)
    expect(generateCopied).not.toHaveBeenCalled()
  })

  it('tells apart sources that differ only in a file name', async () => {
    const renamedSource = await writeSource('renamed', {
      'handler.js': 'released handler',
      'lib/util.js': 'utils',
    })

    const releasedCachePath = await ensureArtifact(
      'artifact.txt',
      releasedSource,
      generateFrom(releasedSource),
    )
    const renamedCachePath = await ensureArtifact(
      'artifact.txt',
      renamedSource,
      generateFrom(renamedSource),
    )

    expect(renamedCachePath).not.toBe(releasedCachePath)
  })
})
