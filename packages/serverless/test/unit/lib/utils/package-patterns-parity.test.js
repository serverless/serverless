/**
 * Pins the package-patterns helper to the exact semantics of the classic
 * packaging engine's resolveFilePathsFromPatterns (which this PR deliberately
 * does NOT modify). If either side ever drifts, this suite fails.
 *
 * Classic evaluates: enumerate globby(['**', ...include]) then apply the
 * ordered toggle. The helper is handed the same enumeration; outputs must be
 * identical (order-insensitive compare: classic returns object-key order).
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { globby } from 'globby'
import packageService from '../../../../lib/plugins/package/lib/package-service.js'
import {
  compilePatterns,
  filterPaths,
} from '../../../../lib/utils/package-patterns.js'

const fixtureDirs = []

afterAll(() => {
  for (const dir of fixtureDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-patterns-parity-'))
  fixtureDirs.push(dir)
  const write = (rel, content = 'x\n') => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content)
  }
  write('handler.js')
  write('assets/logo.png')
  write('assets/secret.txt')
  write('.env')
  write('dist/handler.js.map')
  write('node_modules/fastify/package.json')
  write('node_modules/fastify/lib/route.js')
  write('node_modules/fastify/.internal/hidden.js')
  write('node_modules/keep/index.js')
  write('node_modules/serverless-http/index.js')
  return dir
}

async function classicResolve(serviceDir, includePatterns) {
  const ctx = { serverless: { serviceDir, config: { serviceDir } } }
  return packageService.resolveFilePathsFromPatterns.call(ctx, {
    exclude: [],
    include: includePatterns,
    devDependencyExcludeSet: new Set(),
  })
}

async function helperResolve(serviceDir, includePatterns) {
  // Same enumeration the classic engine performs.
  const allFilePaths = await globby(['**'].concat(includePatterns), {
    cwd: serviceDir,
    dot: true,
    silent: true,
    follow: true,
    nodir: true,
    expandDirectories: false,
  })
  return filterPaths(compilePatterns(includePatterns), allFilePaths)
}

/**
 * Second harness: patterns routed through classic's `exclude` parameter.
 *
 * Classic hands globby only `['**', ...include]`, so negations that arrive via
 * `include` are already applied at enumeration time and its micromatch toggle
 * has nothing left to drop. Negations routed through `exclude` reach the toggle
 * *only* -- which is how the framework feeds `defaultExcludes`, the
 * service-config excludes and the dev-dependency exclusions. Comparing on that
 * route is what actually exercises the exclusion half of the toggle.
 *
 * Classic's ordering is `exclude...` first, then `include...` (see
 * resolveFilePathsFromPatterns); the helper is handed that same ordered list.
 *
 * Note how classic normalizes an exclude entry: a plain entry is negated, but
 * an entry that ALREADY starts with `!` has that `!` *stripped* and becomes a
 * positive pattern (package-service.js, the params.exclude loop). That is the
 * only way to get a positive-then-negation pattern order out of this route, so
 * it is also how the ordering row below is built -- do not "simplify" the
 * mapping to an unconditional `!` prefix.
 */
async function classicResolveSplit(serviceDir, { exclude, include }) {
  const ctx = { serverless: { serviceDir, config: { serviceDir } } }
  return packageService.resolveFilePathsFromPatterns.call(ctx, {
    exclude,
    include,
    devDependencyExcludeSet: new Set(),
  })
}

async function helperResolveSplit(serviceDir, { exclude, include }) {
  const allFilePaths = await globby(['**'].concat(include), {
    cwd: serviceDir,
    dot: true,
    silent: true,
    follow: true,
    nodir: true,
    expandDirectories: false,
  })
  const ordered = [
    ...exclude.map((pattern) =>
      pattern.startsWith('!') ? pattern.slice(1) : `!${pattern}`,
    ),
    ...include,
  ]
  return filterPaths(compilePatterns(ordered), allFilePaths)
}

const SPLIT_PATTERN_SETS = [
  { exclude: ['node_modules/fastify/**'], include: [] },
  { exclude: ['node_modules/**'], include: ['node_modules/keep/**'] },
  { exclude: ['**/*.map', '.env'], include: [] },
  { exclude: ['assets/**'], include: ['assets/logo.png'] },
  {
    exclude: ['node_modules/**'],
    include: ['node_modules/keep/index.js', 'assets/**'],
  },
  // Negation AFTER a positive -- the shape of the commonest real pattern list
  // (`['assets/**', '!assets/secret.txt']`). Classic's exclude loop turns this
  // into patterns `['assets/logo.png', '!assets/**']`, so the negation is last
  // and must win over the earlier positive. Every other row here emits all
  // negations first, which leaves "last match wins" unpinned: a matcher that
  // sorted negations to the front would pass them all.
  { exclude: ['!assets/logo.png', 'assets/**'], include: [] },
  // Same shape, with the trailing negation re-excluding a path an earlier
  // positive had rescued from a broader pattern.
  {
    exclude: ['!node_modules/keep/index.js', 'node_modules/**'],
    include: [],
  },
]

const PATTERN_SETS = [
  ['!node_modules/fastify/**'],
  ['!node_modules/**'],
  ['!node_modules/**', 'node_modules/keep/**'],
  ['!**/*.map'],
  ['assets/**', '!assets/secret.txt'],
  ['!.env'],
  ['!assets/**', 'assets/logo.png', '!node_modules/serverless-http/**'],
  [
    'node_modules/keep/**',
    '!node_modules/keep/**',
    'node_modules/keep/index.js',
  ],
]

describe('package-patterns parity with classic resolveFilePathsFromPatterns', () => {
  test.each(PATTERN_SETS.map((p) => [p.join(' , '), p]))(
    'patterns: %s',
    async (_label, patterns) => {
      const dir = makeFixtureDir()
      const classic = await classicResolve(dir, patterns)
      const helper = await helperResolve(dir, patterns)
      expect(helper.sort()).toEqual(classic.sort())
    },
  )

  test('all-excluded: classic throws, helper returns empty list', async () => {
    const dir = makeFixtureDir()
    await expect(classicResolve(dir, ['!**'])).rejects.toThrow(
      'No file matches include / exclude patterns',
    )
    await expect(helperResolve(dir, ['!**'])).resolves.toEqual([])
  })

  test.each(
    SPLIT_PATTERN_SETS.map((set) => [
      `exclude ${JSON.stringify(set.exclude)} include ${JSON.stringify(set.include)}`,
      set,
    ]),
  )('exclude-routed %s', async (_label, set) => {
    const dir = makeFixtureDir()
    const classic = await classicResolveSplit(dir, set)
    const helper = await helperResolveSplit(dir, set)
    // Guard against a vacuous comparison: on this route the toggle must have
    // dropped something, otherwise the row proves nothing about exclusion.
    const everyFile = await globby(['**'], {
      cwd: dir,
      dot: true,
      nodir: true,
      expandDirectories: false,
    })
    expect(classic.length).toBeLessThan(everyFile.length)
    expect(helper.sort()).toEqual(classic.sort())
  })
})
