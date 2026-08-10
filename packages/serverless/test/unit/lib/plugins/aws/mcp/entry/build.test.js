import { describe, it, expect, afterAll, beforeAll } from '@jest/globals'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const { buildMcpEntry } =
  await import('../../../../../../../scripts/build-mcp-entry.js')

// The bundle carries whichever of these the ambient environment happens to
// have, and the point of the isolation test is to reach the entry's own
// environment check — so they are the only ones stripped. Emptying the
// environment outright is not an option: on Windows a subprocess without
// SystemRoot cannot start, which would break the release CI leg.
const MCP_VARIABLE = /^SERVERLESS_MCP_/

const environmentWithoutMcpVariables = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !MCP_VARIABLE.test(name)),
  )

// The entry is built ahead of time and the resulting single file is all the
// artifact carries: the user's project never installs the MCP SDK, Hono or the
// AWS SDK clients the entry uses. That makes "self-contained" a property
// the build has to be checked for, not one the source can express — a stray
// dependency would only surface as ERR_MODULE_NOT_FOUND in a deployed function.
describe('mcp entry build', () => {
  let output
  let isolatedDir
  let isolatedBundle

  beforeAll(async () => {
    // Node resolves a bare import from the importing *file's* directory
    // upward, so building into the repo would let the bundle find this repo's
    // node_modules and prove nothing. Building outside the repo — where there
    // is no node_modules above it at all — is both the isolation this test
    // needs and the reason it does not overwrite the developer's own
    // `entry/dist/entry.mjs`.
    isolatedDir = await mkdtemp(path.join(tmpdir(), 'mcp-entry-build-'))
    isolatedBundle = path.join(isolatedDir, 'entry.mjs')
    const metafile = await buildMcpEntry({ outfile: isolatedBundle })
    const outputs = Object.values(metafile.outputs)
    expect(outputs).toHaveLength(1)
    ;[output] = outputs
  })

  afterAll(async () => {
    if (isolatedDir) await rm(isolatedDir, { recursive: true, force: true })
  })

  it('leaves nothing but Node builtins for the runtime to resolve', () => {
    const unresolved = output.imports.filter(
      (imported) => imported.external && !isBuiltin(imported.path),
    )
    expect(unresolved).toEqual([])
    // The builtins are what an empty list would look like if the metafile were
    // being read wrong, so pin that the bundle really does import some.
    expect(
      output.imports.filter((imported) => imported.external).length,
    ).toBeGreaterThan(0)
  })

  it('emits no sibling chunk the artifact would have to ship too', () => {
    // `../../../../../../../lib/plugins/aws/mcp/entry/index.mjs` imports
    // `./lib/state.mjs` dynamically, to keep the AWS SDK clients out of the cold
    // start of a server with no `state:`. esbuild inlines that into the one
    // output file; if it ever split it into a chunk instead, only the entry
    // would reach the artifact and the state path would fail at runtime.
    expect(output.imports.filter((imported) => !imported.external)).toEqual([])
  })

  it('imports on its own with no dependencies and no MCP environment', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import(${JSON.stringify(
          pathToFileURL(isolatedBundle).href,
        )}).then(() => console.log('LOADED'), (error) => console.log('FAILED: ' + error.message))`,
      ],
      { env: environmentWithoutMcpVariables() },
    )
    // Reaching the environment check means every import in the bundle resolved
    // with nothing installed: the only failure left is the entry's own, and it
    // names the variable to set.
    expect(stdout).toContain('FAILED:')
    expect(stdout).toContain('SERVERLESS_MCP_SERVER_MODULE')
  })
})
