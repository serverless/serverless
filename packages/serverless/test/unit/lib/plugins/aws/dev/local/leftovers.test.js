import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import {
  SESSION_TEMP_FILES,
  processAlive,
  removeStaleTempDirs,
  removeStaleTestFeed,
  sessionTempPrefix,
} from '../../../../../../../lib/plugins/aws/dev/local/leftovers.js'
import { TEST_FEED_FILE } from '../../../../../../../lib/plugins/aws/dev/local/test-feed.js'
import { cleanTempDirs, tempDir, write } from './helpers.js'

afterEach(() => cleanTempDirs())

const DEAD = 999_001
const LIVING = 999_002
const isAlive = (pid) => pid === LIVING
const sessionFiles = Object.fromEntries(
  SESSION_TEMP_FILES.map((name) => [name, '']),
)
const dirWith = (root, name, files) => {
  fs.mkdirSync(path.join(root, name))
  write(path.join(root, name), files)
}

describe('leftovers of sessions that ended without stopping', () => {
  test("a session's temp directory is named after its process", () => {
    expect(sessionTempPrefix(4321)).toBe('sls-dev-4321-')
  })

  test('removes only the temp directories this tool made for processes that are gone', () => {
    const root = tempDir()
    dirWith(root, `sls-dev-${DEAD}-a1B2c3`, sessionFiles)
    dirWith(root, `sls-dev-${DEAD}-d4E5f6`, {})
    dirWith(root, `sls-dev-${LIVING}-g7H8i9`, sessionFiles)
    // Not ours, or not only ours: a file this tool never writes, another name, a plain file.
    dirWith(root, `sls-dev-${DEAD}-j0K1l2`, {
      ...sessionFiles,
      'notes.txt': 'x',
    })
    dirWith(root, `sls-dev-${DEAD}-m3N4o5`, { 'nested/file': '' })
    dirWith(root, 'sls-dev-local-p6Q7r8', sessionFiles)
    dirWith(root, `sls-dev-${DEAD}`, sessionFiles)
    fs.writeFileSync(path.join(root, `sls-dev-${DEAD}-s9T0u1`), '')
    const removed = removeStaleTempDirs({ tmpRoot: root, isAlive })
    expect(removed.map((dir) => path.basename(dir)).sort()).toEqual([
      `sls-dev-${DEAD}-a1B2c3`,
      `sls-dev-${DEAD}-d4E5f6`,
    ])
    expect(fs.readdirSync(root).sort()).toEqual(
      [
        `sls-dev-${DEAD}`,
        `sls-dev-${DEAD}-j0K1l2`,
        `sls-dev-${DEAD}-m3N4o5`,
        `sls-dev-${DEAD}-s9T0u1`,
        `sls-dev-${LIVING}-g7H8i9`,
        'sls-dev-local-p6Q7r8',
      ].sort(),
    )
  })

  const posix = process.platform === 'win32' ? test.skip : test
  posix('leaves a symbolic link alone, and what it points at', () => {
    const root = tempDir()
    const target = tempDir()
    write(target, sessionFiles)
    fs.symlinkSync(target, path.join(root, `sls-dev-${DEAD}-v2W3x4`))
    expect(removeStaleTempDirs({ tmpRoot: root, isAlive })).toEqual([])
    expect(fs.readdirSync(target).sort()).toEqual(
      [...SESSION_TEMP_FILES].sort(),
    )
  })

  test("leaves another user's directories alone", () => {
    const root = tempDir()
    dirWith(root, `sls-dev-${DEAD}-y5Z6a7`, sessionFiles)
    const uid = fs.statSync(root).uid
    expect(
      removeStaleTempDirs({ tmpRoot: root, isAlive, uid: uid + 1 }),
    ).toEqual([])
    expect(fs.readdirSync(root)).toEqual([`sls-dev-${DEAD}-y5Z6a7`])
  })

  test('a missing temp root is nothing to remove', () => {
    expect(
      removeStaleTempDirs({
        tmpRoot: path.join(tempDir(), 'missing'),
        isAlive,
      }),
    ).toEqual([])
  })

  test('removes the test feed file of a session whose process is gone, and only that one', () => {
    const dir = tempDir()
    const file = path.join(dir, TEST_FEED_FILE)
    const feed = (pid) =>
      fs.writeFileSync(
        file,
        JSON.stringify({ url: 'http://x', token: 't', pid }),
      )
    feed(LIVING)
    expect(removeStaleTestFeed({ dir, isAlive })).toBe(false)
    expect(fs.existsSync(file)).toBe(true)
    fs.writeFileSync(file, 'not json')
    expect(removeStaleTestFeed({ dir, isAlive })).toBe(false)
    expect(fs.existsSync(file)).toBe(true)
    feed(DEAD)
    expect(removeStaleTestFeed({ dir, isAlive })).toBe(true)
    expect(fs.existsSync(file)).toBe(false)
    expect(removeStaleTestFeed({ dir, isAlive })).toBe(false)
  })

  test('a process is alive while it runs, and gone after', () => {
    expect(processAlive(process.pid)).toBe(true)
    expect(processAlive(2 ** 22 + 12_345)).toBe(false)
    expect(processAlive(0)).toBe(false)
    expect(processAlive(-1)).toBe(false)
  })
})
