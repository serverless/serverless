import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  LINKED_DIR_CODE,
  ensureRealDir,
} from '../../../../../../../lib/plugins/aws/dev/state/real-dir.js'

const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
const serviceDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-rd-'))
  dirs.push(dir)
  fs.mkdirSync(path.join(dir, '.serverless'))
  return dir
}
const modeOf = (at) => fs.statSync(at).mode & 0o777
const onPosix = process.platform === 'win32' ? test.skip : test

// An fs whose mkdirSync finds `at` already made by another process (with `mode`), as when two
// sessions start at once in a fresh service: the folder appears between the check and the mkdir.
const racingFs = (at, mode) => ({
  ...fs,
  mkdirSync: (p, options) => {
    if (p === at && !fs.existsSync(p)) fs.mkdirSync(p, { mode })
    return fs.mkdirSync(p, options)
  },
})

describe('ensureRealDir', () => {
  test('a folder another process creates first is used, not an error', () => {
    const dev = path.join(serviceDir(), '.serverless', 'dev')
    expect(ensureRealDir({ dir: dev, fs: racingFs(dev, 0o700) })).toBe(dev)
    expect(fs.lstatSync(dev).isDirectory()).toBe(true)
  })

  onPosix(
    "a folder another process creates first is tightened to its owner's",
    () => {
      const dev = path.join(serviceDir(), '.serverless', 'dev')
      const invocations = path.join(dev, 'invocations')
      fs.mkdirSync(dev, { mode: 0o700 })
      const racing = racingFs(invocations, 0o755)
      // The racing process's umask must not narrow the mode it chose.
      const umask = process.umask(0)
      try {
        ensureRealDir({ dir: dev, sub: ['invocations'], fs: racing })
      } finally {
        process.umask(umask)
      }
      expect(modeOf(invocations)).toBe(0o700)
    },
  )

  onPosix('a new folder is created for its owner only', () => {
    const dev = path.join(serviceDir(), '.serverless', 'dev')
    const umask = process.umask(0)
    try {
      ensureRealDir({ dir: dev, sub: ['invocations', 'fn'], fs })
    } finally {
      process.umask(umask)
    }
    for (const folder of [
      dev,
      path.join(dev, 'invocations'),
      path.join(dev, 'invocations', 'fn'),
    ])
      expect(modeOf(folder)).toBe(0o700)
  })

  onPosix('a link in the place of a folder is refused', () => {
    const service = serviceDir()
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-rd-t-'))
    dirs.push(target)
    const dev = path.join(service, '.serverless', 'dev')
    fs.symlinkSync(target, dev)
    expect(() => ensureRealDir({ dir: dev, sub: ['invocations'], fs })).toThrow(
      expect.objectContaining({ code: LINKED_DIR_CODE }),
    )
    expect(fs.readdirSync(target)).toEqual([])
  })
})
