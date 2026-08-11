import { jest } from '@jest/globals'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import JsZip from 'jszip'
import { log } from '@serverless/util'

// Only this one file name is made unreadable; every other path goes to the real
// filesystem, so the rest of the suite is unaffected by the mock.
const UNREADABLE_ENTRY = 'unreadable.js'

jest.unstable_mockModule('fs/promises', () => {
  const actual = jest.requireActual('fs/promises')
  const lstat = async (target, ...args) => {
    if (String(target).endsWith(UNREADABLE_ENTRY)) {
      const error = new Error(`EACCES: permission denied, lstat '${target}'`)
      error.code = 'EACCES'
      throw error
    }
    return actual.lstat(target, ...args)
  }
  return { ...actual, lstat, default: { ...actual, lstat } }
})

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

// Every fixture directory is tracked and removed after the suite: this file
// creates dozens of them, each holding a node_modules tree and zip artifacts.
const createdServiceDirs = []

afterAll(() => {
  for (const dir of createdServiceDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function makeFixtureDir() {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-pat-'))
  createdServiceDirs.push(serviceDir)
  return serviceDir
}

// `emptyNodeModules` builds the same fixture with an existing but empty
// node_modules directory: the shape of a service that bundles everything, where
// the entry filter never runs at all.
function makeServiceDir({ emptyNodeModules = false } = {}) {
  const serviceDir = makeFixtureDir()
  const buildDir = path.join(serviceDir, '.serverless', 'build')
  const write = (rel, content = 'x\n') => {
    fs.mkdirSync(path.dirname(path.join(buildDir, rel)), { recursive: true })
    fs.writeFileSync(path.join(buildDir, rel), content)
  }
  if (emptyNodeModules) {
    fs.mkdirSync(path.join(buildDir, 'node_modules'), { recursive: true })
  } else {
    write('node_modules/fastify/package.json')
    write('node_modules/fastify/lib/route.js')
    write('node_modules/serverless-http/index.js')
    write('node_modules/keep/index.js')
  }
  write(
    'handler.js',
    'export const hello = async () => ({ statusCode: 200 })\n',
  )
  write('other.js', 'export const other = async () => ({ statusCode: 200 })\n')
  // Source-dir file for additive-include tests.
  fs.mkdirSync(path.join(serviceDir, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(serviceDir, 'assets', 'logo.png'), 'png\n')
  fs.writeFileSync(path.join(serviceDir, 'assets', 'secret.txt'), 'ssh\n')
  return serviceDir
}

function makePlugin(
  serviceDir,
  { servicePatterns = [], omitPatternsKey = false } = {},
) {
  const servicePackage = { individually: true }
  if (!omitPatternsKey) servicePackage.patterns = servicePatterns
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      package: servicePackage,
    },
    pluginManager: { spawn: async () => {} },
  }
  const plugin = new Esbuild(serverless, {})
  plugin._buildProperties = async () => ({})
  return plugin
}

async function zipEntryNames(artifactPath) {
  const zip = await JsZip.loadAsync(fs.readFileSync(artifactPath))
  return Object.keys(zip.files).sort()
}

const artifactSha256 = (artifactPath) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(artifactPath))
    .digest('hex')

// Package the standard fixture from scratch under the given plugin options and
// return the artifact's sha256, so that configurations can be compared byte for
// byte rather than entry-name by entry-name.
async function packageFixtureSha256(pluginOptions) {
  const serviceDir = makeServiceDir()
  const plugin = makePlugin(serviceDir, pluginOptions)
  await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
  return artifactSha256(
    path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
  )
}

async function packageWith(serviceDir, plugin, functions) {
  plugin.functions = async () => functions
  await plugin._package()
}

// archiver emits entries INSIDE the walked dir (prefixed) — there is no bare
// 'node_modules/' root entry in these zips.
const FULL_NODE_MODULES = [
  'node_modules/fastify/',
  'node_modules/fastify/lib/',
  'node_modules/fastify/lib/route.js',
  'node_modules/fastify/package.json',
  'node_modules/keep/',
  'node_modules/keep/index.js',
  'node_modules/serverless-http/',
  'node_modules/serverless-http/index.js',
]

describe('esbuild packaging honors package.patterns (individually)', () => {
  jest.setTimeout(30_000)

  test('no patterns: full node_modules ships, including dir entries', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir)
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
    )
    for (const expected of FULL_NODE_MODULES) {
      expect(entries).toContain(expected)
    }
  })

  test('positive-only patterns leave node_modules untouched', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['assets/logo.png'],
    })
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
    )
    for (const expected of FULL_NODE_MODULES) {
      expect(entries).toContain(expected)
    }
    expect(entries).toContain('assets/logo.png')
  })

  test('function-level negation excludes package (files AND dir husks) from that zip only', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir)
    await packageWith(serviceDir, plugin, {
      fn1: { handler: 'handler.hello' },
      fn2: {
        handler: 'other.other',
        package: {
          patterns: [
            '!node_modules/fastify/**',
            '!node_modules/serverless-http/**',
          ],
        },
      },
    })
    const fn1 = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
    )
    const fn2 = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn2.zip'),
    )
    expect(fn1).toContain('node_modules/fastify/lib/route.js')
    expect(fn1).toContain('node_modules/serverless-http/index.js')
    expect(fn2).not.toContain('node_modules/fastify/lib/route.js')
    expect(fn2).not.toContain('node_modules/fastify/package.json')
    expect(fn2).not.toContain('node_modules/fastify/')
    expect(fn2).not.toContain('node_modules/fastify/lib/')
    expect(fn2).not.toContain('node_modules/serverless-http/index.js')
    expect(fn2).not.toContain('node_modules/serverless-http/')
    expect(fn2).toContain('node_modules/keep/index.js')
  })

  test('service-level negation applies to all function zips', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['!node_modules/serverless-http/**'],
    })
    await packageWith(serviceDir, plugin, {
      fn1: { handler: 'handler.hello' },
      fn2: { handler: 'other.other' },
    })
    for (const fn of ['fn1', 'fn2']) {
      const entries = await zipEntryNames(
        path.join(serviceDir, '.serverless', `my-service-${fn}.zip`),
      )
      expect(entries).not.toContain('node_modules/serverless-http/index.js')
      expect(entries).toContain('node_modules/fastify/lib/route.js')
    }
  })

  test('re-include after broad negation (last match wins)', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['!node_modules/**', 'node_modules/keep/**'],
    })
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
    )
    expect(entries).toContain('node_modules/keep/index.js')
    expect(entries).not.toContain('node_modules/fastify/lib/route.js')
    expect(entries).not.toContain('node_modules/serverless-http/index.js')
  })

  test('function negation removes a service-level additive include from that zip', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, { servicePatterns: ['assets/**'] })
    await packageWith(serviceDir, plugin, {
      fn1: { handler: 'handler.hello' },
      fn2: {
        handler: 'other.other',
        package: { patterns: ['!assets/secret.txt'] },
      },
    })
    const fn1 = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
    )
    const fn2 = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn2.zip'),
    )
    expect(fn1).toContain('assets/secret.txt')
    expect(fn2).toContain('assets/logo.png')
    expect(fn2).not.toContain('assets/secret.txt')
  })

  test('handler bundle and manifest entries are never excluded by patterns', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, { servicePatterns: ['!**'] })
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
    )
    expect(entries).toContain('handler.js')
  })

  // The dir-husk assertions above use a literal-prefix pattern
  // (`!node_modules/fastify/**`), which micromatch already matches against the
  // bare path `node_modules/fastify` — so they pass even if the directory
  // branch is collapsed into isPathIncluded. A wildcard-prefix pattern is what
  // discriminates: micromatch does not match `node_modules/fastify` against
  // `node_modules/*/**`, so only the isDirIncluded bare-base rule removes the
  // husks. Collapse the branch and the three package directories survive here.
  test('wildcard-prefix negation leaves no node_modules entries at all', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['!node_modules/*/**'],
    })
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
    )
    expect(entries.filter((name) => name.startsWith('node_modules/'))).toEqual(
      [],
    )
    expect(entries).toContain('handler.js')
  })

  // Hard constraint: pattern-less and positive-only configurations must produce
  // byte-identical artifacts, because the artifact sha256 drives
  // check-for-changes — any drift there forces a needless redeploy of every
  // function. `node_modules/**` is a positive pattern that matches every
  // archived entry (exercising the filter's pass-through) while adding nothing,
  // since the fixture's node_modules lives under .serverless/build rather than
  // in the service directory that additive includes are globbed from.
  test('pattern-less and positive-only configs produce byte-identical artifacts', async () => {
    const [noKey, emptyList, positiveOnly] = await Promise.all([
      packageFixtureSha256({ omitPatternsKey: true }),
      packageFixtureSha256({ servicePatterns: [] }),
      packageFixtureSha256({ servicePatterns: ['node_modules/**'] }),
    ])
    expect(emptyList).toBe(noKey)
    expect(positiveOnly).toBe(noKey)
  })

  // A positive pattern that DOES match files in the service directory adds
  // exactly those entries and must leave every other entry's bytes alone.
  test('a matching positive pattern only adds entries, altering nothing else', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['assets/logo.png'],
    })
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const withInclude = path.join(
      serviceDir,
      '.serverless',
      'my-service-fn1.zip',
    )
    const baselineDir = makeServiceDir()
    const baselinePlugin = makePlugin(baselineDir)
    await packageWith(baselineDir, baselinePlugin, {
      fn1: { handler: 'handler.hello' },
    })
    const baseline = path.join(baselineDir, '.serverless', 'my-service-fn1.zip')

    const fingerprint = async (artifactPath) => {
      const zip = await JsZip.loadAsync(fs.readFileSync(artifactPath))
      const entries = await Promise.all(
        Object.values(zip.files).map(async (entry) => ({
          name: entry.name,
          date: entry.date.getTime(),
          sha256: crypto
            .createHash('sha256')
            .update(await entry.async('nodebuffer'))
            .digest('hex'),
        })),
      )
      return entries.sort((a, b) => a.name.localeCompare(b.name))
    }

    const added = await fingerprint(withInclude)
    const base = await fingerprint(baseline)
    expect(added.map((e) => e.name)).toEqual(
      ['assets/logo.png', ...base.map((e) => e.name)].sort((a, b) =>
        a.localeCompare(b),
      ),
    )
    expect(added.filter((e) => e.name !== 'assets/logo.png')).toEqual(base)
  })

  // An empty pattern ('' or a bare '!') reaches the pattern helpers from a
  // variable that resolved to nothing. micromatch throws on it, which would
  // fail packaging outright for a configuration where such a pattern was
  // previously inert. Empty patterns are dropped at compile time instead,
  // excluding nothing.
  test.each([[['!']], [['']], [['!', '']]])(
    'empty patterns %j exclude nothing and never fail packaging',
    async (servicePatterns) => {
      const serviceDir = makeServiceDir()
      const plugin = makePlugin(serviceDir, { servicePatterns })
      await packageWith(serviceDir, plugin, {
        fn1: { handler: 'handler.hello' },
      })
      const entries = await zipEntryNames(
        path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
      )
      for (const expected of FULL_NODE_MODULES) {
        expect(entries).toContain(expected)
      }
      expect(entries).toContain('handler.js')
    },
  )

  // Byte-identity is asserted for the bare '!' only. globby reads '' as "match
  // everything", so a '' pattern additionally pulls the whole service directory
  // in as additive includes — long-standing behavior of the include glob, not
  // something the entry filter decides.
  test("a bare '!' pattern leaves the artifact byte-identical", async () => {
    const [bang, noKey] = await Promise.all([
      packageFixtureSha256({ servicePatterns: ['!'] }),
      packageFixtureSha256({ omitPatternsKey: true }),
    ])
    expect(bang).toBe(noKey)
  })

  test('entry dates stay pinned when the filter is active', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['!node_modules/serverless-http/**'],
    })
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const zip = await JsZip.loadAsync(
      fs.readFileSync(
        path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
      ),
    )
    for (const entry of Object.values(zip.files)) {
      expect(entry.date.getFullYear()).toBe(1980)
    }
  })
})

describe('esbuild packaging honors package.patterns (_packageAll)', () => {
  jest.setTimeout(30_000)

  test('service-level negation applies to the single service zip', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['!node_modules/serverless-http/**'],
    })
    plugin.serverless.service.package.individually = false
    await plugin._packageAll({ fn1: { handler: 'handler.hello' } })
    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service.zip'),
    )
    expect(entries).not.toContain('node_modules/serverless-http/index.js')
    expect(entries).not.toContain('node_modules/serverless-http/')
    expect(entries).toContain('node_modules/fastify/lib/route.js')
  })

  // Function-level patterns are only honored when packaging individually, which
  // matches classic packaging: a single shared zip has no per-function view to
  // narrow. Pinned so the mirrored filter never silently starts reading them.
  test('function-level patterns are ignored by _packageAll', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir)
    plugin.serverless.service.package.individually = false
    await plugin._packageAll({
      fn1: {
        handler: 'handler.hello',
        package: { patterns: ['!node_modules/fastify/**'] },
      },
    })
    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service.zip'),
    )
    expect(entries).toContain('node_modules/fastify/lib/route.js')
  })

  // Same hard constraint as the individually path: the single service zip's
  // sha256 drives check-for-changes, so routing entries through the filter must
  // not shift a single byte for configurations that exclude nothing.
  test('pattern-less and positive-only configs produce byte-identical artifacts', async () => {
    const packageAllSha256 = async (pluginOptions) => {
      const serviceDir = makeServiceDir()
      const plugin = makePlugin(serviceDir, pluginOptions)
      plugin.serverless.service.package.individually = false
      await plugin._packageAll({ fn1: { handler: 'handler.hello' } })
      return artifactSha256(
        path.join(serviceDir, '.serverless', 'my-service.zip'),
      )
    }
    const [noKey, emptyList, positiveOnly] = await Promise.all([
      packageAllSha256({ omitPatternsKey: true }),
      packageAllSha256({ servicePatterns: [] }),
      packageAllSha256({ servicePatterns: ['node_modules/**'] }),
    ])
    expect(emptyList).toBe(noKey)
    expect(positiveOnly).toBe(noKey)
  })
})

describe('esbuild patterns observability', () => {
  jest.setTimeout(30_000)
  const esbuildLogger = log.get('esbuild')
  let infoSpy
  let warningSpy
  let debugSpy

  beforeEach(() => {
    infoSpy = jest.spyOn(esbuildLogger, 'info').mockImplementation(() => {})
    warningSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})
    debugSpy = jest.spyOn(esbuildLogger, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    warningSpy.mockRestore()
    debugSpy.mockRestore()
  })

  test('info log names the artifact and count only when entries were excluded', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['!node_modules/serverless-http/**'],
    })
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const infoMessages = infoSpy.mock.calls.map((c) => c[0])
    expect(
      infoMessages.some(
        (m) =>
          m.includes('my-service-fn1.zip') && m.includes('package.patterns'),
      ),
    ).toBe(true)
  })

  test('no info log when nothing was excluded', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir)
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const infoMessages = infoSpy.mock.calls.map((c) => c[0])
    expect(infoMessages.some((m) => m.includes('package.patterns'))).toBe(false)
  })

  test('warning fires once when patterns strip all of node_modules under packages: external', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['!node_modules/**'],
    })
    plugin._buildProperties = async () => ({ packages: 'external' })
    await packageWith(serviceDir, plugin, {
      fn1: { handler: 'handler.hello' },
      fn2: { handler: 'other.other' },
    })
    const warnings = warningSpy.mock.calls
      .map((c) => c[0])
      .filter((m) => m.includes('node_modules'))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('packages: external')
  })

  test('no warning without packages: external', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['!node_modules/**'],
    })
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    expect(
      warningSpy.mock.calls
        .map((c) => c[0])
        .filter((m) => m.includes('node_modules')),
    ).toHaveLength(0)
  })

  // The warning claims the patterns emptied node_modules, so only exclusions
  // made by the node_modules walk may arm it. A service that bundles its
  // dependencies (nothing under node_modules to keep) and merely narrows an
  // additive include has not touched node_modules, and telling it to review
  // those patterns would be plainly wrong.
  test('no warning when only additive includes were excluded', async () => {
    const serviceDir = makeServiceDir({ emptyNodeModules: true })
    const plugin = makePlugin(serviceDir, { servicePatterns: ['assets/**'] })
    plugin._buildProperties = async () => ({ packages: 'external' })
    await packageWith(serviceDir, plugin, {
      fn1: {
        handler: 'handler.hello',
        package: { patterns: ['!assets/secret.txt'] },
      },
    })
    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
    )
    // Guard the premise: the additive include really was excluded, so the
    // total counter is non-zero and only its node_modules scoping suppresses
    // the warning.
    expect(entries).toContain('assets/logo.png')
    expect(entries).not.toContain('assets/secret.txt')
    const infoMessages = infoSpy.mock.calls.map((c) => c[0])
    expect(infoMessages.some((m) => m.includes('package.patterns'))).toBe(true)
    expect(warningSpy.mock.calls.map((c) => c[0])).toEqual([])
  })

  // The debug trace is unconditional, so it is the only record of what the
  // filter decided for a run that excluded nothing — it must carry the compiled
  // patterns and both counters even then.
  test('debug trace records patterns and counters for every function', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['!node_modules/serverless-http/**'],
    })
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const traces = debugSpy.mock.calls
      .map((c) => c[0])
      .filter((m) => typeof m === 'string' && m.includes('package.patterns'))
    expect(traces).toHaveLength(1)
    expect(traces[0]).toContain('fn1')
    expect(traces[0]).toContain('node_modules/serverless-http/**')
    expect(traces[0]).toMatch(/excluded \d+/)
    expect(traces[0]).toMatch(/node_modules entries excluded \d+/)
    expect(traces[0]).toMatch(/node_modules files kept \d+/)
  })

  test('_packageAll logs the exclusion count against the service zip', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: ['!node_modules/serverless-http/**'],
    })
    plugin.serverless.service.package.individually = false
    await plugin._packageAll({ fn1: { handler: 'handler.hello' } })
    const infoMessages = infoSpy.mock.calls.map((c) => c[0])
    expect(
      infoMessages.some(
        (m) => m.includes('my-service.zip') && m.includes('package.patterns'),
      ),
    ).toBe(true)
    const traces = debugSpy.mock.calls
      .map((c) => c[0])
      .filter((m) => typeof m === 'string' && m.includes('package.patterns'))
    expect(traces).toHaveLength(1)
    expect(traces[0]).toContain('my-service.zip')
  })
})

// Pattern filtering must not reintroduce the entry-order race that made
// artifact hashes differ between identical runs (and therefore forced phantom
// redeploys through check-for-changes). Entries are filtered after the sort, so
// the sequence of appends stays fixed — pinned here by packaging the same
// unchanged service repeatedly with filtering active and comparing the entry
// order and the whole-zip sha256, the same way packaging-determinism.test.js
// pins the unfiltered path.
describe('esbuild patterns determinism', () => {
  // The 6-run tests below carry a per-test 60s timeout (third argument):
  // jest.setTimeout is file-global no matter where it is called, so a
  // describe-scoped call here would be overridden by later calls in the file.

  // Many small files across several packages, so an ordering leak in the
  // filtered walk shows up reliably rather than by luck.
  function makeRacyServiceDir() {
    const serviceDir = makeFixtureDir()
    const buildDir = path.join(serviceDir, '.serverless', 'build')
    for (const dep of ['dep-a', 'dep-b', 'dep-c', 'keep']) {
      const depDir = path.join(buildDir, 'node_modules', dep)
      fs.mkdirSync(path.join(depDir, 'lib'), { recursive: true })
      fs.writeFileSync(path.join(depDir, 'package.json'), `{"name":"${dep}"}\n`)
      fs.writeFileSync(path.join(depDir, 'index.js'), 'module.exports = 1\n')
      fs.writeFileSync(
        path.join(depDir, 'lib', 'util.js'),
        'module.exports = 2\n',
      )
    }
    fs.writeFileSync(path.join(buildDir, 'package.json'), '{"name":"svc"}\n')
    fs.writeFileSync(path.join(buildDir, 'package-lock.json'), '{}\n')
    fs.mkdirSync(path.join(buildDir, 'src'), { recursive: true })
    const racyFunctions = {}
    for (let i = 0; i < 6; i++) {
      fs.writeFileSync(
        path.join(buildDir, 'src', `fn${i}.js`),
        `export const handler = async () => ({ statusCode: 20${i} })\n`,
      )
      fs.writeFileSync(
        path.join(buildDir, 'src', `fn${i}.js.map`),
        `{"version":3,"file":"fn${i}.js"}\n`,
      )
      racyFunctions[`fn${i}`] = { handler: `src/fn${i}.handler` }
    }
    fs.writeFileSync(path.join(serviceDir, 'static-a.txt'), 'a\n')
    fs.writeFileSync(path.join(serviceDir, 'static-b.txt'), 'b\n')
    return { serviceDir, racyFunctions }
  }

  // Excludes whole packages, re-includes one of them, and drops one additive
  // include — so every filtered code path (node_modules files, node_modules
  // directory husks, and the includes list) contributes to the artifact.
  const FILTERING_PATTERNS = [
    'static-*.txt',
    '!static-b.txt',
    '!node_modules/**',
    'node_modules/keep/**',
  ]

  async function zipFingerprint(artifactPath) {
    const bytes = fs.readFileSync(artifactPath)
    const zip = await JsZip.loadAsync(bytes)
    return {
      hash: crypto.createHash('sha256').update(bytes).digest('hex'),
      order: Object.values(zip.files).map((entry) => entry.name),
    }
  }

  test('individual packaging stays byte-identical across 6 runs with filtering active', async () => {
    const { serviceDir, racyFunctions } = makeRacyServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: FILTERING_PATTERNS,
    })
    plugin.functions = async () => racyFunctions

    const fingerprints = []
    for (let run = 0; run < 6; run++) {
      await plugin._package()
      fingerprints.push(
        await zipFingerprint(
          path.join(serviceDir, '.serverless', 'my-service-fn0.zip'),
        ),
      )
    }

    for (const fingerprint of fingerprints.slice(1)) {
      expect(fingerprint.order).toEqual(fingerprints[0].order)
      expect(fingerprint.hash).toBe(fingerprints[0].hash)
    }
    // Guard the premise: the patterns really did filter this artifact.
    const entries = fingerprints[0].order
    expect(entries).toContain('node_modules/keep/lib/util.js')
    expect(entries).toContain('static-a.txt')
    expect(entries).not.toContain('static-b.txt')
    expect(
      entries.filter(
        (name) =>
          name.startsWith('node_modules/') &&
          !name.startsWith('node_modules/keep'),
      ),
    ).toEqual([])
  }, 60_000)

  test('_packageAll stays byte-identical across 6 runs with filtering active', async () => {
    const { serviceDir, racyFunctions } = makeRacyServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: FILTERING_PATTERNS,
    })
    plugin.serverless.service.package.individually = false

    const fingerprints = []
    for (let run = 0; run < 6; run++) {
      await plugin._packageAll(racyFunctions)
      fingerprints.push(
        await zipFingerprint(
          path.join(serviceDir, '.serverless', 'my-service.zip'),
        ),
      )
    }

    for (const fingerprint of fingerprints.slice(1)) {
      expect(fingerprint.order).toEqual(fingerprints[0].order)
      expect(fingerprint.hash).toBe(fingerprints[0].hash)
    }
    const entries = fingerprints[0].order
    expect(entries).toContain('node_modules/keep/lib/util.js')
    expect(entries).toContain('static-a.txt')
    expect(entries).not.toContain('static-b.txt')
    expect(
      entries.filter(
        (name) =>
          name.startsWith('node_modules/') &&
          !name.startsWith('node_modules/keep'),
      ),
    ).toEqual([])
  }, 60_000)
})

// package.patterns must not become a way to route around an unreadable file.
// Every walked entry is stat'ed before the patterns get a say, so an entry that
// cannot be read fails packaging even when the patterns would have dropped it —
// the same fail-fast contract as an entry that the patterns keep. Reordering the
// walk to filter before the stat would silently turn "cannot read" into
// "silently skipped", so both packaging paths pin the behavior here.
describe('esbuild patterns cannot suppress an unreadable entry', () => {
  jest.setTimeout(30_000)

  // The unreadable file sits under a package that the patterns exclude wholesale.
  function makeServiceDirWithUnreadableExcludedEntry() {
    const serviceDir = makeServiceDir()
    fs.writeFileSync(
      path.join(
        serviceDir,
        '.serverless',
        'build',
        'node_modules',
        'fastify',
        UNREADABLE_ENTRY,
      ),
      'x\n',
    )
    return serviceDir
  }

  const EXCLUDING_PATTERNS = ['!node_modules/fastify/**']

  test('individual packaging still fails when an excluded entry is unreadable', async () => {
    const serviceDir = makeServiceDirWithUnreadableExcludedEntry()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: EXCLUDING_PATTERNS,
    })
    plugin.functions = async () => ({ fn1: { handler: 'handler.hello' } })

    await expect(plugin._package()).rejects.toMatchObject({
      code: 'CANNOT_READ_FILE',
      message: expect.stringContaining(UNREADABLE_ENTRY),
    })
  })

  test('_packageAll still fails when an excluded entry is unreadable', async () => {
    const serviceDir = makeServiceDirWithUnreadableExcludedEntry()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: EXCLUDING_PATTERNS,
    })
    plugin.serverless.service.package.individually = false

    await expect(
      plugin._packageAll({ fn1: { handler: 'handler.hello' } }),
    ).rejects.toMatchObject({
      code: 'CANNOT_READ_FILE',
      message: expect.stringContaining(UNREADABLE_ENTRY),
    })
  })

  // Guard the premise: without the unreadable file, the very same patterns
  // package cleanly and really do drop that package — so the rejections above
  // are caused by the unreadable entry, not by the patterns themselves.
  test('the same patterns package cleanly when every entry is readable', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir, {
      servicePatterns: EXCLUDING_PATTERNS,
    })
    await packageWith(serviceDir, plugin, { fn1: { handler: 'handler.hello' } })
    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-fn1.zip'),
    )
    expect(entries).toContain('node_modules/keep/index.js')
    expect(
      entries.filter((name) => name.startsWith('node_modules/fastify')),
    ).toEqual([])
  })
})
