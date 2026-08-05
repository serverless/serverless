import { readFile } from 'fs/promises'

// Passing --testPathIgnorePatterns on the CLI REPLACES jest's default
// ["/node_modules/"], so any test-shaped file shipped inside a fixture's
// installed node_modules becomes collectable. Every script that passes the flag
// must therefore restore the node_modules pattern explicitly.
const readScripts = async () => {
  const packageJsonUrl = new URL('../../package.json', import.meta.url)
  const { scripts } = JSON.parse(await readFile(packageJsonUrl, 'utf8'))
  return scripts
}

// The assertions below match on the SET of values a script passes rather than on
// a substring of the command, so adding or reordering unrelated jest flags cannot
// false-fail them — while an ignore pattern that is dropped or altered still
// does.
const ignorePatternsOf = (command) =>
  new Set(
    [...command.matchAll(/--testPathIgnorePatterns[= ](\S+)/g)].map(
      ([, value]) => value,
    ),
  )

const passesPathArgument = (command, testPath) =>
  new RegExp(
    `(?:^|\\s)${testPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
  ).test(command)

describe('jest --testPathIgnorePatterns usage in package scripts', () => {
  test('every script overriding testPathIgnorePatterns still ignores /node_modules/', async () => {
    const scripts = await readScripts()

    const overriding = Object.entries(scripts).filter(([, command]) =>
      command.includes('--testPathIgnorePatterns'),
    )
    expect(overriding.length).toBeGreaterThan(0)

    const offenders = overriding
      .filter(([, command]) => !ignorePatternsOf(command).has('/node_modules/'))
      .map(([name]) => name)
    expect(offenders).toEqual([])
  })
})

// The live MCP suite deploys real REST APIs and needs a per-account Cognito
// prerequisite, so it is deliberately NOT part of the default fleet: it runs from
// its own path-filtered workflow (.github/workflows/ci-mcp.yml) via `test:mcp`.
// Every script that globs all of tests/integration therefore has to exclude it —
// jest picks up new directories under tests/integration automatically, so
// dropping the exclusion would silently put those deploys on every pull request.
describe('the live mcp suite is reachable only through test:mcp', () => {
  const MCP_PATH = 'tests/integration/mcp/'

  test.each(['test', 'test:binary'])(
    'the %s script excludes the mcp suite',
    async (scriptName) => {
      const scripts = await readScripts()
      expect([...ignorePatternsOf(scripts[scriptName])]).toContain(MCP_PATH)
    },
  )

  test('test:mcp targets the mcp suite', async () => {
    const scripts = await readScripts()
    expect(passesPathArgument(scripts['test:mcp'], MCP_PATH)).toBe(true)
  })

  // 2-core GitHub runners default jest to a single worker, which would serialize
  // the two live mcp files and defeat the whole point of splitting the fixtures.
  test('test:mcp runs the two fixtures in parallel', async () => {
    const scripts = await readScripts()
    expect(scripts['test:mcp']).toMatch(/--maxWorkers[= ]2\b/)
  })
})
