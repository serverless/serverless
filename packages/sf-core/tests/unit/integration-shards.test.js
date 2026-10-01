import { readdir, readFile } from 'fs/promises'
import { createRequire } from 'module'
import path from 'path'
import url from 'url'

// The live integration suites run as one CI job per AWS account
// (.github/workflows/test-framework.yml). tests/integration/shards.json assigns
// each suite to a shard and records its duration; the sequencer turns that
// into `jest --shard`. These tests keep the map, the sequencer and the
// workflow in agreement, so no suite is silently skipped or moved away from
// the account that holds its prerequisites.
const require = createRequire(import.meta.url)
const shards = require('../integration/shards.json')
const IntegrationSequencer = require('../integration/sequencer.cjs')

const rootDir = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../..',
)
const toTest = (relativePath) => ({
  path: path.join(rootDir, relativePath),
  context: { config: { rootDir } },
})
const relativeKey = (test) =>
  path.relative(rootDir, test.path).split(path.sep).join('/')

const readIgnorePatterns = async () => {
  const { scripts } = JSON.parse(
    await readFile(path.join(rootDir, 'package.json'), 'utf8'),
  )
  return [...scripts.test.matchAll(/--testPathIgnorePatterns[= ](\S+)/g)].map(
    ([, pattern]) => new RegExp(pattern),
  )
}

const isIgnored = (absolutePath, ignore) =>
  ignore.some((re) => re.test(absolutePath.replaceAll('\\', '/')))

// Mirror exactly what `npm test` collects: every *.test.js under
// tests/integration minus the script's own --testPathIgnorePatterns.
const collectedSuites = async () => {
  const ignore = await readIgnorePatterns()
  const entries = await readdir(path.join(rootDir, 'tests/integration'), {
    recursive: true,
  })
  return entries
    .filter((entry) => entry.endsWith('.test.js'))
    .map((entry) =>
      path.posix.join('tests/integration', entry.split(path.sep).join('/')),
    )
    .filter(
      (relativePath) => !isIgnored(path.join(rootDir, relativePath), ignore),
    )
    .sort()
}

const sequencer = new IntegrationSequencer({ contexts: [], globalConfig: {} })

describe('integration shard map', () => {
  test('every collected integration suite has an entry', async () => {
    const missing = (await collectedSuites()).filter(
      (suite) => !shards.suites[suite],
    )
    expect(missing).toEqual([])
  })

  test('every entry points at a suite that npm test collects', async () => {
    const collected = new Set(await collectedSuites())
    const stale = Object.keys(shards.suites).filter(
      (suite) => !collected.has(suite),
    )
    expect(stale).toEqual([])
  })

  test('every entry has a valid shard and a positive duration', () => {
    const invalid = Object.entries(shards.suites).filter(
      ([, { shard, seconds }]) =>
        !Number.isInteger(shard) ||
        shard < 1 ||
        shard > shards.shardCount ||
        !(seconds > 0),
    )
    expect(invalid).toEqual([])
  })

  // test-1 holds every prerequisite listed in TESTING.md; the other accounts
  // hold none, so a suite with a recorded reason may only run in shard 1.
  test('suites with a prerequisite pin stay in shard 1', () => {
    const moved = Object.entries(shards.suites)
      .filter(([, entry]) => entry.pin && entry.shard !== 1)
      .map(([suite]) => suite)
    expect(moved).toEqual([])
  })
})

// Jest normalises the ignore patterns for the platform's path separator, so
// the guard has to as well, or Windows (the release workflow) would see the
// excluded domains and mcp suites as unlisted.
describe('collected-suite filter', () => {
  test('excludes ignored suites on Windows-style paths too', async () => {
    const ignore = await readIgnorePatterns()
    const windowsPath = path.win32.join(
      'C:\\repo\\packages\\sf-core',
      'tests/integration/domains/http-api/http-api.test.js',
    )
    expect(isIgnored(windowsPath, ignore)).toBe(true)
  })
})

describe('IntegrationSequencer', () => {
  const all = Object.keys(shards.suites).map(toTest)
  const unlisted = toTest('tests/integration/new-suite/new-suite.test.js')

  test('shards partition the suites, and an unlisted suite runs in shard 1', () => {
    const input = [...all, unlisted]
    const picked = [1, 2, 3].map((shardIndex) =>
      sequencer
        .shard(input, { shardIndex, shardCount: 3 })
        .map((test) => test.path),
    )
    const flat = picked.flat()
    expect(new Set(flat).size).toBe(flat.length)
    expect([...flat].sort()).toEqual(input.map((test) => test.path).sort())
    expect(picked[0]).toContain(unlisted.path)
  })

  test('sort keeps every suite, unlisted first, then longest first', () => {
    const sorted = sequencer.sort([...all, unlisted])
    expect(sorted).toHaveLength(all.length + 1)
    expect(sorted[0]).toBe(unlisted)
    const seconds = sorted
      .slice(1)
      .map((test) => shards.suites[relativeKey(test)].seconds)
    expect(seconds).toEqual([...seconds].sort((a, b) => b - a))
  })

  test('a shard count that differs from the map fails loudly', () => {
    expect(() =>
      sequencer.shard(all, { shardIndex: 1, shardCount: 4 }),
    ).toThrow(/shards\.json/)
  })

  test('the CI matrix runs exactly the shards the map defines', async () => {
    const workflow = await readFile(
      path.join(rootDir, '../../.github/workflows/test-framework.yml'),
      'utf8',
    )
    const legs = [...workflow.matchAll(/--shard=(\d+)\/(\d+)/g)]
    expect(legs.map(([, , count]) => Number(count))).toEqual(
      Array(shards.shardCount).fill(shards.shardCount),
    )
    expect(legs.map(([, index]) => Number(index)).sort()).toEqual(
      Array.from({ length: shards.shardCount }, (_, i) => i + 1),
    )
  })
})
