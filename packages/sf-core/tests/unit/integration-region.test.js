import { readdir, readFile } from 'fs/promises'
import { createRequire } from 'module'
import path from 'path'
import url from 'url'

// CI runs shards 2 and 3 of the live integration suites in a different AWS
// region per platform (.github/workflows/test-framework.yml), passed to the
// suites only as AWS_REGION. Every suite without a `pin` in shards.json can
// land in those shards, so it must deploy and check its resources in
// TEST_REGION (tests/utils/testRegion.js). A hard-coded us-east-1 in such a
// suite or its fixture would deploy to one region and look in another, so
// this test fails on any that remains. Pinned suites always run in shard 1
// and keep their regions.
const require = createRequire(import.meta.url)
const shards = require('../integration/shards.json')

const rootDir = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../..',
)
const HARD_CODED_REGION = 'us-east-1'
// A SAM/CloudFormation project ignores AWS_REGION, so its samconfig reads it
// explicitly, with the same us-east-1 default TEST_REGION and the Framework use.
const FOLLOWS_AWS_REGION = "${env:AWS_REGION, 'us-east-1'}"

const suites = Object.entries(shards.suites)
const pinnedDirs = new Set(
  suites.filter(([, entry]) => entry.pin).map(([suite]) => path.dirname(suite)),
)
const unpinned = suites
  .filter(([, entry]) => !entry.pin)
  .map(([suite]) => suite)

// The files a suite owns: its whole directory (the test and its fixtures),
// unless a pinned suite shares that directory, in which case only the test
// file is the unpinned suite's own. Installed packages and build output
// (node_modules, .serverless, .esbuild and other dot directories) are not.
const ownedFiles = async (suite) => {
  const dir = path.dirname(suite)
  if (pinnedDirs.has(dir)) return [suite]
  const entries = await readdir(path.join(rootDir, dir), {
    recursive: true,
    withFileTypes: true,
  })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(rootDir, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/'),
    )
    .filter(
      (file) =>
        !file
          .split('/')
          .slice(0, -1)
          .some((part) => part === 'node_modules' || part.startsWith('.')),
    )
}

describe('integration suite regions', () => {
  test('there are unpinned suites to check', () => {
    expect(unpinned.length).toBeGreaterThan(0)
  })

  test.each(unpinned)('%s does not hard-code us-east-1', async (suite) => {
    const hits = []
    for (const file of await ownedFiles(suite)) {
      const lines = (await readFile(path.join(rootDir, file), 'utf8')).split(
        '\n',
      )
      lines.forEach((line, index) => {
        if (
          line.replaceAll(FOLLOWS_AWS_REGION, '').includes(HARD_CODED_REGION)
        ) {
          hits.push(`${file}:${index + 1}: ${line.trim()}`)
        }
      })
    }
    if (hits.length) {
      throw new Error(
        `This suite has no pin in tests/integration/shards.json, so CI may run it in another region. Use TEST_REGION from tests/utils/testRegion.js in the test, and leave the region out of its fixtures so the service follows AWS_REGION (a samconfig uses ${FOLLOWS_AWS_REGION}):\n${hits.join('\n')}`,
      )
    }
  })
})
