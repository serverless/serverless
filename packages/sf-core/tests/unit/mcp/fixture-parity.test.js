import { readFile } from 'fs/promises'
import path from 'path'
import url from 'url'

// `tests/integration/mcp/fixture` (driven by `mcp.test.js`) and its sibling
// `fixture-auth` (driven by `mcp-auth.test.js`) are separate directories so the
// two live suites never share staged packaging artifacts, `.serverless/` or
// `node_modules/` (jest parallelizes test FILES with no worker cap, and the full
// integration run relies on that). The cost of that isolation is a
// duplicated server module: both suites run the same shared check list, so both
// need the same tools with the same behaviors, and an import reaching above a
// service directory would not survive classic packaging.
//
// This test is what keeps the duplication honest — it fails the moment the copies
// diverge, in the unit suite, with no AWS involved.
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const fixtures = path.join(__dirname, '..', '..', 'integration', 'mcp')

const DIRS = ['fixture', 'fixture-auth']

const readBoth = (relativePath) =>
  Promise.all(
    DIRS.map((dir) => readFile(path.join(fixtures, dir, relativePath), 'utf8')),
  )

const IDENTICAL_FILES = [path.join('src', 'server.mjs'), 'package.json']

describe('MCP integration fixtures stay in sync', () => {
  test.each(IDENTICAL_FILES)(
    '%s is byte-identical in fixture and fixture-auth',
    async (relativePath) => {
      const [core, auth] = await readBoth(relativePath)
      // On a failure: `cp fixture/<file> fixture-auth/<file>` — see
      // tests/integration/mcp/fixture-auth/README.md.
      expect(auth).toBe(core)
    },
  )

  // `package-lock.json` is the one shared file that cannot be compared
  // byte-for-byte: npm writes the directory name into the root `name` field, so
  // the two lockfiles differ by exactly that string. Everything else is the
  // resolved dependency tree, and it has to match — otherwise the two suites
  // install different versions of the same server module and the shared check
  // list stops proving the same thing in both.
  test('package-lock.json resolves the same tree in both fixtures', async () => {
    const [core, auth] = (await readBoth('package-lock.json')).map((raw) => {
      const lock = JSON.parse(raw)
      delete lock.name
      return lock
    })
    // On a failure: `cp fixture/package-lock.json fixture-auth/package-lock.json`
    // and set its `name` back to "fixture-auth" — see
    // tests/integration/mcp/fixture-auth/README.md.
    expect(auth).toEqual(core)
  })
})
