#!/usr/bin/env node
// Builds the MCP Lambda entry ahead of time.
//
// The entry runs in the user's function but its dependencies (the MCP SDK,
// Hono, the two AWS SDK clients) are development dependencies of this
// package alone, so it has to reach the artifact as one self-contained file —
// hence `external: []`. Only the user's own server module stays outside the
// bundle: the entry imports it through a computed path, which esbuild cannot
// (and must not) resolve, and which it reports as an unbundled dynamic import.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const entryDir = path.join(packageRoot, 'lib/plugins/aws/mcp/entry')

/** Where the single self-contained file the artifact ships is written. */
export const mcpEntryBundlePath = path.join(entryDir, 'dist/entry.mjs')

/**
 * Runs the build and hands back esbuild's metafile.
 *
 * Exported so the build itself is testable — the self-containment claim above
 * is only true as long as every import esbuild leaves unresolved is a Node
 * builtin, and that is a property of the output, not of intent.
 *
 * `outfile` defaults to the path the artifact ships. The test suite overrides
 * it with a temporary directory so running the tests does not overwrite a
 * developer's built bundle behind their back.
 */
export const buildMcpEntry = async ({
  logLevel = 'silent',
  outfile = mcpEntryBundlePath,
} = {}) => {
  const { metafile } = await esbuild.build({
    entryPoints: [path.join(entryDir, 'index.mjs')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    // The MCP SDK packages declare `engines.node: ">=20"`, and the config schema
    // rejects an older runtime for an mcp server (MINIMUM_NODE_MAJOR in
    // ../lib/validate.js), so nothing older ever has to run this file.
    target: 'node20',
    external: [],
    metafile: true,
    // A CommonJS dependency bundled into an ES module keeps its `require` calls,
    // and an ES module has no `require` to answer them.
    banner: {
      js: [
        "import { createRequire as __mcpCreateRequire } from 'node:module'",
        'const require = __mcpCreateRequire(import.meta.url)',
      ].join('\n'),
    },
    logLevel,
  })
  return metafile
}

// Direct run — `npm run build:mcp:entry` — versus being imported by the test
// that exercises the build.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildMcpEntry({ logLevel: 'info' })
}
