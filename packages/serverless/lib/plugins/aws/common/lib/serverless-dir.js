/**
 * Emptying `<serviceDir>/.serverless`, as `package`, `deploy` and `deploy function` do, keeps the
 * one entry that is not a build output: `dev/`, where a Dev Mode session keeps its record (its
 * session file, control token, event log and invocation files). Without that entry, nothing
 * changes: the directory itself is removed, as it always was.
 */
import path from 'path'
import fse from 'fs-extra'
import { DEV_DIR_SEGMENTS } from '../../dev/state/paths.js'

/** The entry of `.serverless` that is kept: `dev`. */
export const KEPT_ENTRY = DEV_DIR_SEGMENTS[DEV_DIR_SEGMENTS.length - 1]

/** Whether `dirPath` (`.serverless`) has a `dev` entry. */
export const hasKeptEntry = (dirPath) => {
  try {
    // A link there is kept as a link, never followed.
    fse.lstatSync(path.join(dirPath, KEPT_ENTRY))
    return true
  } catch {
    return false
  }
}

/** Removes `.serverless` (`dirPath`), or everything in it but `dev/` when that is there. */
export const emptyServerlessDir = (dirPath) => {
  if (!hasKeptEntry(dirPath)) {
    fse.removeSync(dirPath)
    return
  }
  for (const name of fse.readdirSync(dirPath)) {
    if (name !== KEPT_ENTRY) fse.removeSync(path.join(dirPath, name))
  }
}

/** A copy filter that leaves out the top-level `dev` entry of `root`. */
export const withoutKeptEntry = (root) => (source) =>
  path.relative(root, source) !== KEPT_ENTRY
