// packages/sf-core/scripts/verify-mcp-entry-packaging.js
/**
 * Proves the prebuilt MCP Lambda entry ships where the released CLI looks for
 * it. The bundled plugin resolves the entry from `<package>/dist` through the
 * source-tree layout (`entryPathFrom` in
 * `packages/serverless/lib/plugins/aws/mcp/lib/packaging.js`), so a release that
 * copies it anywhere else fails every MCP deploy with
 * MCP_ENTRY_BUNDLE_MISSING — and nothing else in the pipeline would notice.
 *
 * The expected location is derived from that same module rather than written out
 * here, so the two cannot drift. Run AFTER the packed tarball is extracted (see
 * test:build).
 * Usage: node verify-mcp-entry-packaging.js <path-to-extracted-package-dir>
 */
import { stat } from 'fs/promises'
import path from 'path'
import { entryPathFrom } from '../../serverless/lib/plugins/aws/mcp/lib/packaging.js'

const packageDir = process.argv[2]
if (!packageDir) {
  console.error(
    'Usage: node verify-mcp-entry-packaging.js <extracted package dir>',
  )
  process.exit(1)
}

// Where the plugin resolves the entry once it runs from `<package>/dist`,
// expressed relative to the package root — i.e. the path inside the tarball.
const bundleDir = path.join(path.sep, 'package', 'dist')
const expectedRelative = path.relative(
  path.dirname(bundleDir),
  entryPathFrom(bundleDir),
)

try {
  const stats = await stat(path.join(packageDir, expectedRelative))
  if (!stats.isFile()) throw new Error('not a file')
} catch (error) {
  throw new Error(
    `the packed framework is missing the prebuilt MCP Lambda entry at "${expectedRelative}" (${error.message}).\n` +
      'Every MCP deploy from this build would fail with MCP_ENTRY_BUNDLE_MISSING.\n' +
      'Check that `npm run build:mcp:entry -w @serverless/framework` ran before prepareDistributionTarballs.js, and that the copy registered there targets the path above.',
  )
}

console.log(
  `✓ packed framework ships the prebuilt MCP Lambda entry at ${expectedRelative}`,
)
