/**
 * How a web app's server starts on this machine: the first of START_SOURCES that applies.
 *  - `config`: `webApps.<name>.dev.command`, run in the user's shell like an npm script.
 *  - `entry`: the web app's `entry`, when it is a source file in the service directory (also for a
 *    `package.artifact` zip whose entry path exists there), run with Node.js from source.
 * Neither applies to an entry that is a build output (under BUILD_OUTPUT_DIRECTORIES, without case
 * on macOS and Windows, or a web app with `build: false`): its row then says `build_output_entry`.
 * Another way to start a server later (a CLI flag, framework detection) is one more entry in
 * START_SOURCES.
 */
import fs from 'fs'
import path from 'path'

/** Directories whose files are a build's output, never a server's source. */
export const BUILD_OUTPUT_DIRECTORIES = Object.freeze([
  '.next',
  '.output',
  'dist',
  'build',
  '.serverless',
])

const isFile = (file, stat) => {
  try {
    return stat(file).isFile()
  } catch {
    return false
  }
}

const fromConfig = ({ webApp, serviceDir }) => {
  const command = webApp?.dev?.command
  if (typeof command !== 'string' || command.trim() === '') return null
  return { source: 'config', command, cwd: serviceDir }
}

// File systems that compare names without case by default.
const CASELESS = new Set(['darwin', 'win32'])

const fromEntry = ({
  webApp,
  serviceDir,
  stat = fs.statSync,
  platform = process.platform,
}) => {
  const entry = webApp?.entry
  if (typeof entry !== 'string' || !entry || webApp.build === false) {
    return null
  }
  const entryFile = path.resolve(serviceDir, entry)
  const relative = path.relative(serviceDir, entryFile)
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null
  }
  if (
    relative
      .split(/[\\/]/)
      .slice(0, -1)
      .some((part) =>
        BUILD_OUTPUT_DIRECTORIES.includes(
          CASELESS.has(platform) ? part.toLowerCase() : part,
        ),
      )
  ) {
    return null
  }
  if (!isFile(entryFile, stat)) return null
  return { source: 'entry', entryFile, cwd: serviceDir }
}

export const START_SOURCES = Object.freeze([
  Object.freeze({ name: 'config', resolve: fromConfig }),
  Object.freeze({ name: 'entry', resolve: fromEntry }),
])

/**
 * `{ source: 'config', command, cwd }`, `{ source: 'entry', entryFile, cwd }` (entryFile
 * absolute), or null when nothing can start the web app `key` on this machine.
 */
export const resolveStartSource = ({
  key,
  webApp,
  serviceDir,
  stat,
  platform,
}) => {
  for (const { resolve } of START_SOURCES) {
    const found = resolve({ key, webApp, serviceDir, stat, platform })
    if (found) return found
  }
  return null
}
