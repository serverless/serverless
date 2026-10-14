/**
 * What a session leaves behind when it cannot stop cleanly (a second Ctrl+C, a forced exit, a
 * killed CLI): its temp directory under the OS temp root and the test feed's file. A later
 * session removes them once the process that made them is gone, and only what is recognisably
 * Dev Mode's: a temp directory is named after the process that made it and holds only the files a
 * session writes there; the feed file names its process.
 */
import fs from 'fs'
import path from 'path'
import { TEST_FEED_FILE } from './test-feed.js'

/** The files a session's temp directory holds: empty AWS and boto configuration files. */
export const SESSION_TEMP_FILES = Object.freeze([
  'aws-config',
  'aws-credentials',
  'boto-config',
])

/** A session's temp directory is `sls-dev-<pid>-XXXXXX` (mkdtemp adds the six characters). */
export const sessionTempPrefix = (pid) => `sls-dev-${pid}-`
const SESSION_TEMP_DIR = /^sls-dev-(\d+)-[A-Za-z0-9]{6}$/

/**
 * Whether the process `pid` still runs. A pid owned by another user (EPERM) counts as running:
 * nothing is removed on a guess.
 */
export const processAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** Removes the temp directories of sessions whose process is gone; returns the ones it removed. */
export const removeStaleTempDirs = ({
  tmpRoot,
  isAlive = processAlive,
  uid = process.getuid?.(),
  onError = () => {},
}) => {
  let names
  try {
    names = fs.readdirSync(tmpRoot)
  } catch {
    return []
  }
  const removed = []
  for (const name of names) {
    const match = SESSION_TEMP_DIR.exec(name)
    if (!match || isAlive(Number(match[1]))) continue
    const dir = path.join(tmpRoot, name)
    try {
      const stat = fs.lstatSync(dir)
      if (!stat.isDirectory()) continue
      if (uid !== undefined && stat.uid !== uid) continue
      if (
        !fs.readdirSync(dir).every((file) => SESSION_TEMP_FILES.includes(file))
      )
        continue
      fs.rmSync(dir, { recursive: true, force: true })
      removed.push(dir)
    } catch (error) {
      onError(dir, error)
    }
  }
  return removed
}

/**
 * Removes the test feed file in `dir` when the session that wrote it is gone; returns whether it
 * did. A file that does not name its process is left alone.
 */
export const removeStaleTestFeed = ({ dir, isAlive = processAlive }) => {
  const file = path.join(dir, TEST_FEED_FILE)
  let pid
  try {
    pid = JSON.parse(fs.readFileSync(file, 'utf8'))?.pid
  } catch {
    return false
  }
  if (!Number.isInteger(pid) || pid <= 0 || isAlive(pid)) return false
  fs.rmSync(file, { force: true })
  return true
}
