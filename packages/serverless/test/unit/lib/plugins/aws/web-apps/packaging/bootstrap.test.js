import { describe, it, expect, afterAll } from '@jest/globals'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import {
  generateBootstrap,
  normalizeEntryPath,
} from '../../../../../../../lib/plugins/aws/web-apps/packaging/bootstrap.js'
import { BOOTSTRAP_FILE } from '../../../../../../../lib/plugins/aws/web-apps/constants.js'

// Prints the listen settings the web app sees, as a CommonJS module
const CJS_TARGET =
  'const { PORT, HOSTNAME } = process.env\nconsole.log(JSON.stringify({ PORT, HOSTNAME }))\nmodule.exports = {}\n'
// The same as an ES module in a `.js` file (esbuild `format: esm` output
// without `outExtension`)
const ESM_TARGET =
  'const { PORT, HOSTNAME } = process.env\nconsole.log(JSON.stringify({ PORT, HOSTNAME }))\nexport {}\n'

describe('web app bootstrap', () => {
  const tmpDirs = []

  afterAll(() => {
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true })
  })

  /**
   * Write the bootstrap and its target into a fresh directory (laid out as
   * the zip root) and load the bootstrap the way the Web Functions runtime
   * does: with `import()` from another main module, so neither
   * `require.main` nor `process.argv[1]` points at the entry on their own.
   * `withoutRunMain` deletes `Module.runMain` first. Returns the target's
   * stdout lines.
   */
  function runBootstrapLines({
    entryPath,
    entryFormat = 'cjs',
    target = CJS_TARGET,
    endpoint,
    enableSourceMaps = false,
    withoutRunMain = false,
  }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-web-bootstrap-'))
    tmpDirs.push(root)
    // A package.json without `type`, so Node detects each target's module
    // syntax regardless of any package.json above the temp directory
    fs.writeFileSync(path.join(root, 'package.json'), '{}')
    const targetPath = path.join(root, ...entryPath.split('/'))
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, target)
    const bootstrapPath = path.join(root, BOOTSTRAP_FILE)
    fs.writeFileSync(
      bootstrapPath,
      generateBootstrap({ entryPath, entryFormat, enableSourceMaps }),
    )

    // A minimal environment: no NODE_OPTIONS from the test runner
    const env = { PATH: process.env.PATH }
    if (endpoint !== undefined) env.AWS_LAMBDA_HTTP_ENDPOINT = endpoint

    // The stand-in runtime, a file outside the zip root
    const runtimeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sls-web-runtime-'),
    )
    tmpDirs.push(runtimeDir)
    const runtimePath = path.join(runtimeDir, 'index.mjs')
    fs.writeFileSync(
      runtimePath,
      [
        "import Module from 'node:module'",
        ...(withoutRunMain ? ['delete Module.runMain'] : []),
        `await import(${JSON.stringify(pathToFileURL(bootstrapPath).href)})`,
        '',
      ].join('\n'),
    )
    const result = spawnSync(process.execPath, [runtimePath], {
      cwd: root,
      env,
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      throw new Error(
        `Bootstrap exited with ${result.status}: ${result.stderr}`,
      )
    }
    return result.stdout.trim().split('\n')
  }

  /** The listen settings a target prints, as an object. */
  const runBootstrap = (params) => JSON.parse(runBootstrapLines(params)[0])

  it('sets PORT and HOSTNAME from an IPv4 listen address', () => {
    expect(
      runBootstrap({ entryPath: 'src/server.js', endpoint: '0.0.0.0:3000' }),
    ).toEqual({ PORT: '3000', HOSTNAME: '0.0.0.0' })
  })

  it('strips the brackets around an IPv6 host', () => {
    expect(
      runBootstrap({ entryPath: 'src/server.js', endpoint: '[::]:3000' }),
    ).toEqual({ PORT: '3000', HOSTNAME: '::' })
  })

  it('sets neither variable when the listen address is not set', () => {
    expect(runBootstrap({ entryPath: 'src/server.js' })).toEqual({})
  })

  it('starts an ES module entry with a .js extension', () => {
    expect(
      runBootstrap({
        entryPath: 'dist/server.js',
        entryFormat: 'esm',
        target: ESM_TARGET,
        endpoint: '0.0.0.0:8080',
      }),
    ).toEqual({ PORT: '8080', HOSTNAME: '0.0.0.0' })
  })

  it('starts an entry whose path has spaces, # and %', () => {
    expect(
      runBootstrap({
        entryPath: 'dir with space/#a%b.js',
        endpoint: '0.0.0.0:3000',
      }),
    ).toEqual({ PORT: '3000', HOSTNAME: '0.0.0.0' })
  })

  it('enables source maps in the process, not through NODE_OPTIONS', () => {
    const source = generateBootstrap({
      entryPath: 'src/server.js',
      entryFormat: 'cjs',
      enableSourceMaps: true,
    })
    expect(source).toContain('process.setSourceMapsEnabled(true)')
    expect(source).not.toContain('NODE_OPTIONS')
    expect(
      runBootstrap({
        entryPath: 'src/server.js',
        endpoint: '0.0.0.0:3000',
        enableSourceMaps: true,
      }),
    ).toEqual({ PORT: '3000', HOSTNAME: '0.0.0.0' })
  })

  it('leaves source maps alone unless asked', () => {
    expect(
      generateBootstrap({
        entryPath: 'src/server.js',
        entryFormat: 'cjs',
        enableSourceMaps: false,
      }),
    ).not.toContain('setSourceMapsEnabled')
  })

  describe('a server that starts only as the main module', () => {
    // Express-style CommonJS guard
    const CJS_GUARDED =
      "if (require.main === module) console.log('listening')\nconsole.log(String(process.argv[1]))\n"
    // The common ES module guard
    const ESM_GUARDED = [
      "import { pathToFileURL } from 'node:url'",
      "if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log('listening')",
      'console.log(String(process.argv[1]))',
      '',
    ].join('\n')

    it('starts a CommonJS entry as the main module', () => {
      const [marker, argv1] = runBootstrapLines({
        entryPath: 'src/server.cjs',
        entryFormat: 'cjs',
        target: CJS_GUARDED,
      })
      expect(marker).toBe('listening')
      expect(argv1).toMatch(/[\\/]src[\\/]server\.cjs$/)
    })

    it('points process.argv[1] at an ES module entry', () => {
      const [marker, argv1] = runBootstrapLines({
        entryPath: 'src/server.mjs',
        entryFormat: 'esm',
        target: ESM_GUARDED,
      })
      expect(marker).toBe('listening')
      expect(argv1).toMatch(/[\\/]src[\\/]server\.mjs$/)
    })

    it('imports a CommonJS entry when Module.runMain is not available', () => {
      const lines = runBootstrapLines({
        entryPath: 'src/server.cjs',
        entryFormat: 'cjs',
        target: CJS_GUARDED,
        withoutRunMain: true,
      })
      // Started, with the guard false as before, and argv[1] still set
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatch(/[\\/]src[\\/]server\.cjs$/)
    })
  })

  describe('generateBootstrap', () => {
    const source = (entryFormat) =>
      generateBootstrap({
        entryPath: 'src/server.js',
        entryFormat,
        enableSourceMaps: false,
      })

    it('sets process.argv[1] to the entry for both formats', () => {
      for (const entryFormat of ['cjs', 'esm']) {
        const lines = source(entryFormat).split('\n')
        const entryLine = lines.indexOf(
          'const entry = join(root, "src/server.js")',
        )
        const argvLine = lines.indexOf('process.argv[1] = entry')
        expect(entryLine).toBeGreaterThan(-1)
        // Before the entry loads
        expect(argvLine).toBeGreaterThan(entryLine)
        expect(argvLine).toBeLessThan(
          lines.findIndex((line) => /runMain\(\)|await import/.test(line)),
        )
      }
    })

    it('starts a CommonJS entry with Module.runMain, falling back to import()', () => {
      const cjs = source('cjs')
      expect(cjs).toContain("import Module from 'node:module'")
      expect(cjs).toContain("if (typeof Module.runMain === 'function') {")
      expect(cjs).toContain('  Module.runMain()')
      expect(cjs).toContain('  await import(pathToFileURL(entry).href)')
    })

    it('imports an ES module entry', () => {
      const esm = source('esm')
      expect(esm).not.toContain('runMain')
      expect(esm).toContain('await import(pathToFileURL(entry).href)')
    })
  })

  describe('normalizeEntryPath', () => {
    it('turns an entry into its POSIX path inside the zip', () => {
      expect(normalizeEntryPath('./src/server.js')).toBe('src/server.js')
      expect(normalizeEntryPath('src\\server.js')).toBe('src/server.js')
      expect(normalizeEntryPath('.next/standalone/server.js')).toBe(
        '.next/standalone/server.js',
      )
    })
  })
})
