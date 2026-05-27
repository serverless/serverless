import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import ServerlessError from '../../../../../serverless-error.js'

const execFileAsync = promisify(execFile)

const BINARY_NAME = process.platform === 'win32' ? 'bootstrap.exe' : 'bootstrap'

/**
 * Walk `sourceDir` recursively and return the max `mtimeMs` across files
 * that influence a Go build. Excludes dot-entries (`.git`, `.cache`, …)
 * and any directory named `vendor` — vendored deps are checked in once
 * and their mtime is noisy on a fresh clone. Considers only `.go`
 * sources and `go.mod` / `go.sum` (module-graph inputs). Symlinks are
 * skipped (no `dirent.isDirectory()` follow-through).
 *
 * @param {string} dir
 * @returns {Promise<number>} max mtime in ms, or 0 if no eligible files.
 */
async function _newestSourceMtime(dir) {
  let max = 0
  /** @type {import('node:fs').Dirent[]} */
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'vendor') continue
      const inner = await _newestSourceMtime(full)
      if (inner > max) max = inner
      continue
    }
    if (!entry.isFile()) continue
    if (
      !entry.name.endsWith('.go') &&
      entry.name !== 'go.mod' &&
      entry.name !== 'go.sum'
    ) {
      continue
    }
    try {
      const st = await fs.stat(full)
      if (st.mtimeMs > max) max = st.mtimeMs
    } catch {
      // ignore — file may have vanished mid-walk
    }
  }
  return max
}

/**
 * Decide whether the compiled `bootstrap` binary is stale relative to
 * the Go source tree. Returns `true` whenever the binary is missing or
 * any tracked source file is newer than the binary's mtime.
 *
 * @param {object} args
 * @param {string} args.binaryPath
 * @param {string} args.sourceDir
 * @returns {Promise<boolean>}
 */
export async function shouldRebuild({ binaryPath, sourceDir }) {
  let binStat
  try {
    binStat = await fs.stat(binaryPath)
  } catch (err) {
    if (err.code === 'ENOENT') return true
    throw err
  }
  const srcMtime = await _newestSourceMtime(sourceDir)
  return srcMtime > binStat.mtimeMs
}

/**
 * Build (or reuse a cached) `bootstrap` binary for a Go-handler Lambda.
 *
 * The cache is keyed by `functionKey` under `buildCacheRoot` and
 * invalidated by source-tree mtimes — see `shouldRebuild`. On a hit,
 * the Go toolchain is not invoked at all (so users without Go on PATH
 * can still iterate against a previously built artifact).
 *
 * `go build` is invoked via `execFile` (never the shell-string `exec`
 * variant) with the source directory as both `cwd` and the build
 * target, so module-mode resolution works the same way it does on the
 * CLI.
 *
 * @param {object} args
 * @param {string} args.functionKey
 * @param {string} args.sourceDir   Absolute path to the package directory.
 * @param {string} [args.sourceFile]  Accepted for diagnostics; not used
 *   to drive the build (Go builds at package granularity).
 * @param {string} [args.servicePath]  Reserved for future use.
 * @param {string} args.buildCacheRoot
 * @param {string} [args.goCommand]  Override the `go` binary path —
 *   useful for tests and for users with multiple toolchains.
 * @returns {Promise<{ binaryPath: string, fromCache: boolean }>}
 */
export async function ensureBuilt({
  functionKey,
  sourceDir,
  sourceFile,
  servicePath,
  buildCacheRoot,
  goCommand = 'go',
}) {
  const outDir = path.join(buildCacheRoot, functionKey)
  const binaryPath = path.join(outDir, BINARY_NAME)

  if (!(await shouldRebuild({ binaryPath, sourceDir }))) {
    return { binaryPath, fromCache: true }
  }

  // Validate sourceDir BEFORE invoking `go build`. Both "go not on PATH"
  // and "sourceDir doesn't exist" surface as `err.code === 'ENOENT'` from
  // execFile, so without this check a typo in `handler` would be reported
  // as "Go toolchain not found" — confusing and misleading.
  try {
    await fs.access(sourceDir)
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ServerlessError(
        `Go source directory not found for ${functionKey}: ${sourceDir}. ` +
          "Check the function's `handler` path resolves to a real directory.",
        'OFFLINE_GO_SOURCE_MISSING',
      )
    }
    throw err
  }

  await fs.mkdir(outDir, { recursive: true })

  try {
    // Pass `.` (resolved against cwd = sourceDir) rather than the
    // absolute path. With Go modules, `go build /abs/path` only works
    // when the path falls under the active module's tree as Go sees
    // it; `.` is the unambiguous, module-mode-friendly form and avoids
    // "directory outside main module" errors on tmpdir-rooted builds.
    await execFileAsync(goCommand, ['build', '-o', binaryPath, '.'], {
      cwd: sourceDir,
      env: { ...process.env },
    })
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ServerlessError(
        `Go toolchain not found (tried ${goCommand}). Install Go or set PATH/GOROOT.`,
        'OFFLINE_GO_BINARY_MISSING',
      )
    }
    const detail = err.stderr || err.message
    throw new ServerlessError(
      `go build failed for ${functionKey}: ${detail}`,
      'OFFLINE_GO_BUILD_FAILED',
    )
  }

  return { binaryPath, fromCache: false }
}
