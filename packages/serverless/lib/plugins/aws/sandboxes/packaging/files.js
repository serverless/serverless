'use strict'

import path from 'path'
import { globbySync } from 'globby'
import {
  getPackageExcludes,
  getPackageIncludes,
} from '../../../package/lib/package-service.js'
import {
  applyPatterns,
  compilePatterns,
} from '../../../../utils/package-patterns.js'

/**
 * Directories a sandbox artifact leaves out at any depth, on top of the
 * defaults every artifact gets. The artifact is the build input of an image
 * built on ARM64 by its Dockerfile, which installs dependencies itself: local
 * dependency directories and caches are machine-specific and can't change what
 * the image needs, yet they would change the content hash and rebuild it.
 * `serverless dev` ignores changes to them for the same reason.
 *
 * Matched against paths relative to the artifact directory. A `package.patterns`
 * entry re-includes them (e.g. `app/node_modules/**`).
 */
export const SANDBOX_DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
]

const SANDBOX_DEFAULT_EXCLUDES = SANDBOX_DEFAULT_EXCLUDE_DIRS.map(
  (dir) => `**/${dir}/**`,
)

/**
 * The patterns a sandbox's files are selected with, as for a function: the
 * excludes every artifact starts from, then the service-level and the
 * sandbox's own `package.patterns`. Both are relative to the service directory.
 *
 * @param {object} serverless
 * @param {object} cfg - the sandbox's config
 * @returns {{ excludes: string[], includes: string[] }}
 */
export function resolveSandboxPatterns(serverless, cfg) {
  return {
    excludes: getPackageExcludes(serverless, [], true),
    includes: getPackageIncludes(serverless, cfg?.package?.patterns || []),
  }
}

const toPosix = (p) => p.split(path.sep).join('/')

/**
 * The files of a local sandbox artifact that go into its zip (and into the
 * `serverless dev` build context), relative to the artifact directory, sorted.
 *
 * Every file starts included. In order, last match wins: `excludes` (paths
 * relative to `serviceDir`; a leading `!` re-includes, as in function
 * packaging), the sandbox defaults (relative to the artifact), then `includes`
 * (relative to `serviceDir`). The root `Dockerfile` is always kept: the image
 * is built from it.
 *
 * @param {string} artifactDir - absolute path of the artifact directory
 * @param {object} options
 * @param {string} options.serviceDir - absolute path of the service directory
 * @param {string[]} [options.excludes]
 * @param {string[]} [options.includes]
 * @returns {string[]}
 */
export function selectSandboxFiles(
  artifactDir,
  { serviceDir, excludes = [], includes = [] },
) {
  const files = globbySync('**/*', {
    cwd: artifactDir,
    dot: true,
    onlyFiles: true,
  })
  const serviceRelative = new Map(
    files.map((file) => [
      file,
      toPosix(path.relative(serviceDir, path.join(artifactDir, file))),
    ]),
  )
  const servicePaths = [...serviceRelative.values()]
  const states = new Map(servicePaths.map((p) => [p, true]))

  applyPatterns(
    compilePatterns(
      excludes.map((p) => (p.startsWith('!') ? p.slice(1) : `!${p}`)),
    ),
    servicePaths,
    states,
  )
  applyPatterns(
    compilePatterns(SANDBOX_DEFAULT_EXCLUDES.map((p) => `!${p}`)),
    files,
    states,
    (file) => serviceRelative.get(file),
  )
  applyPatterns(compilePatterns(includes), servicePaths, states)

  if (serviceRelative.has('Dockerfile')) {
    states.set(serviceRelative.get('Dockerfile'), true)
  }

  return files
    .filter((file) => states.get(serviceRelative.get(file)))
    .sort((a, b) => a.localeCompare(b))
}
