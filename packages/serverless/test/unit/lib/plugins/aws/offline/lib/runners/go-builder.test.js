import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, utimes, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  ensureBuilt,
  shouldRebuild,
} from '../../../../../../../../lib/plugins/aws/offline/lib/runners/go-builder.js'

const BIN_NAME = process.platform === 'win32' ? 'bootstrap.exe' : 'bootstrap'

async function makeTempDir(prefix) {
  return mkdtemp(path.join(tmpdir(), `go-builder-${prefix}-`))
}

async function setMtime(filePath, epochSeconds) {
  await utimes(filePath, epochSeconds, epochSeconds)
}

const goAvailable = (() => {
  try {
    execFileSync('go', ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
const itGo = goAvailable ? it : it.skip
const itPosix = process.platform === 'win32' ? it.skip : it

describe('go-builder shouldRebuild', () => {
  it('returns true when binary does not exist', async () => {
    const sourceDir = await makeTempDir('src-nobin')
    await writeFile(path.join(sourceDir, 'main.go'), 'package main\n')
    const binaryPath = path.join(sourceDir, 'nope', BIN_NAME)
    await expect(shouldRebuild({ binaryPath, sourceDir })).resolves.toBe(true)
  })

  it('returns false when binary mtime is newer than newest source', async () => {
    const sourceDir = await makeTempDir('src-fresh-bin')
    const srcFile = path.join(sourceDir, 'main.go')
    await writeFile(srcFile, 'package main\n')
    await setMtime(srcFile, 1_700_000_000) // older

    const binDir = await makeTempDir('bin-fresh')
    const binaryPath = path.join(binDir, BIN_NAME)
    await writeFile(binaryPath, 'binary')
    await setMtime(binaryPath, 1_700_000_100) // newer

    await expect(shouldRebuild({ binaryPath, sourceDir })).resolves.toBe(false)
  })

  it('returns true when newest source is newer than binary', async () => {
    const sourceDir = await makeTempDir('src-newer')
    const srcFile = path.join(sourceDir, 'main.go')
    await writeFile(srcFile, 'package main\n')

    const binDir = await makeTempDir('bin-old')
    const binaryPath = path.join(binDir, BIN_NAME)
    await writeFile(binaryPath, 'binary')
    await setMtime(binaryPath, 1_700_000_000) // old
    await setMtime(srcFile, 1_700_000_500) // newer than bin

    await expect(shouldRebuild({ binaryPath, sourceDir })).resolves.toBe(true)
  })

  it('ignores vendor/ and dot-directories when computing source mtime', async () => {
    const sourceDir = await makeTempDir('src-vendor')
    const srcFile = path.join(sourceDir, 'main.go')
    await writeFile(srcFile, 'package main\n')
    await setMtime(srcFile, 1_700_000_000) // old

    const vendorDir = path.join(sourceDir, 'vendor', 'github.com', 'x')
    await mkdir(vendorDir, { recursive: true })
    const vendorFile = path.join(vendorDir, 'fresh.go')
    await writeFile(vendorFile, 'package x\n')
    await setMtime(vendorFile, 1_900_000_000) // very recent — should be ignored

    const dotDir = path.join(sourceDir, '.cache')
    await mkdir(dotDir, { recursive: true })
    const dotFile = path.join(dotDir, 'fresh.go')
    await writeFile(dotFile, 'package x\n')
    await setMtime(dotFile, 1_900_000_000) // should be ignored

    const binDir = await makeTempDir('bin-vendor')
    const binaryPath = path.join(binDir, BIN_NAME)
    await writeFile(binaryPath, 'binary')
    await setMtime(binaryPath, 1_700_000_100) // newer than main.go

    await expect(shouldRebuild({ binaryPath, sourceDir })).resolves.toBe(false)
  })

  it('includes go.mod and go.sum in mtime computation', async () => {
    const sourceDir = await makeTempDir('src-gomod')
    const srcFile = path.join(sourceDir, 'main.go')
    await writeFile(srcFile, 'package main\n')
    await setMtime(srcFile, 1_700_000_000) // old

    const binDir = await makeTempDir('bin-gomod')
    const binaryPath = path.join(binDir, BIN_NAME)
    await writeFile(binaryPath, 'binary')
    await setMtime(binaryPath, 1_700_000_100) // newer than .go

    const goMod = path.join(sourceDir, 'go.mod')
    await writeFile(goMod, 'module example.com/x\n')
    await setMtime(goMod, 1_700_000_500) // even newer than bin

    await expect(shouldRebuild({ binaryPath, sourceDir })).resolves.toBe(true)
  })
})

describe('go-builder ensureBuilt', () => {
  it('throws OFFLINE_GO_BINARY_MISSING when goCommand points at a non-existent path', async () => {
    const sourceDir = await makeTempDir('eb-nobinary')
    const buildCacheRoot = await makeTempDir('eb-cache-nobinary')
    await expect(
      ensureBuilt({
        functionKey: 'fn',
        sourceDir,
        sourceFile: path.join(sourceDir, 'main.go'),
        servicePath: sourceDir,
        buildCacheRoot,
        goCommand: '/nonexistent/path/to/go',
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_GO_BINARY_MISSING' })
  })

  it('throws OFFLINE_GO_SOURCE_MISSING when sourceDir does not exist', async () => {
    // Both "go binary missing on PATH" and "sourceDir missing" surface as
    // err.code === 'ENOENT' from execFile. The disambiguating fs.access
    // check must fire before the build to keep the error message honest
    // when the user mistypes `handler`.
    const sourceDir = '/nonexistent/source/directory/typo'
    const buildCacheRoot = await makeTempDir('eb-cache-no-src')
    await expect(
      ensureBuilt({
        functionKey: 'fn',
        sourceDir,
        sourceFile: path.join(sourceDir, 'main.go'),
        servicePath: sourceDir,
        buildCacheRoot,
        goCommand: '/usr/bin/false',
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_GO_SOURCE_MISSING' })
  })

  itPosix(
    'skips the build when shouldRebuild returns false (fromCache: true)',
    async () => {
      const sourceDir = await makeTempDir('eb-cache-src')
      const srcFile = path.join(sourceDir, 'main.go')
      await writeFile(srcFile, 'package main\n')
      await setMtime(srcFile, 1_700_000_000)

      const buildCacheRoot = await makeTempDir('eb-cache-root')
      const fnKey = 'fn'
      const outDir = path.join(buildCacheRoot, fnKey)
      await mkdir(outDir, { recursive: true })
      const binaryPath = path.join(outDir, BIN_NAME)
      await writeFile(binaryPath, 'binary')
      await setMtime(binaryPath, 1_700_000_500) // newer than source

      // /usr/bin/false exists on macOS/Linux and exits non-zero. If
      // ensureBuilt actually invoked it, the call would reject. fromCache
      // means it never ran.
      const result = await ensureBuilt({
        functionKey: fnKey,
        sourceDir,
        sourceFile: srcFile,
        servicePath: sourceDir,
        buildCacheRoot,
        goCommand: '/usr/bin/false',
      })
      expect(result).toEqual({ binaryPath, fromCache: true })
    },
  )

  itGo(
    'builds a real Go source file to a working bootstrap binary',
    async () => {
      const sourceDir = await makeTempDir('eb-realgo-src')
      await writeFile(
        path.join(sourceDir, 'main.go'),
        'package main\n\nfunc main() {}\n',
      )
      await writeFile(
        path.join(sourceDir, 'go.mod'),
        'module example.com/echo\n\ngo 1.21\n',
      )

      const buildCacheRoot = await makeTempDir('eb-realgo-cache')
      const result = await ensureBuilt({
        functionKey: 'realfn',
        sourceDir,
        sourceFile: path.join(sourceDir, 'main.go'),
        servicePath: sourceDir,
        buildCacheRoot,
      })
      expect(result.fromCache).toBe(false)
      expect(result.binaryPath).toBe(
        path.join(buildCacheRoot, 'realfn', BIN_NAME),
      )
      const st = await stat(result.binaryPath)
      expect(st.isFile()).toBe(true)
      expect(st.size).toBeGreaterThan(0)

      // Second call should hit the cache.
      const result2 = await ensureBuilt({
        functionKey: 'realfn',
        sourceDir,
        sourceFile: path.join(sourceDir, 'main.go'),
        servicePath: sourceDir,
        buildCacheRoot,
      })
      expect(result2).toEqual({
        binaryPath: result.binaryPath,
        fromCache: true,
      })
    },
    30_000,
  )
})
