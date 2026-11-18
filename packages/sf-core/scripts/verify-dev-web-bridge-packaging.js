// packages/sf-core/scripts/verify-dev-web-bridge-packaging.js
/**
 * Proves the Dev Mode web bridge zip ships where the released CLI looks for it. The bundled plugin
 * resolves it from `<package>/dist` through the source-tree layout (`webBridgeArtifactPathFrom` in
 * packages/serverless/lib/plugins/aws/dev/attach/naming.js); a release that copies it anywhere
 * else fails every web app session with DEV_MODE_WEB_BRIDGE_MISSING, and no PR CI runs the
 * release. The zip must hold the file a dev revision starts (WEB_BRIDGE_ENTRY) and the licences
 * of the third-party code it bundles (WEB_BRIDGE_NOTICES) at its root.
 * Usage: node verify-dev-web-bridge-packaging.js <path-to-extracted-package-dir>
 */
import { readFile } from 'fs/promises'
import path from 'path'
import AdmZip from 'adm-zip'
import {
  WEB_BRIDGE_ENTRY,
  WEB_BRIDGE_NOTICES,
  webBridgeArtifactPathFrom,
} from '../../serverless/lib/plugins/aws/dev/attach/naming.js'

const packageDir = process.argv[2]
if (!packageDir) {
  console.error(
    'Usage: node verify-dev-web-bridge-packaging.js <extracted package dir>',
  )
  process.exit(1)
}

const bundleDir = path.join(path.sep, 'package', 'dist')
const relative = path.relative(
  path.dirname(bundleDir),
  webBridgeArtifactPathFrom(bundleDir),
)
let names
try {
  const zip = new AdmZip(await readFile(path.join(packageDir, relative)))
  names = zip.getEntries().map((entry) => entry.entryName)
} catch (error) {
  throw new Error(
    `the Dev Mode web bridge zip at "${relative}" is missing or unreadable in the packed framework (${error.message}).\n` +
      'Check that `npm run build:devmode:web-bridge -w @serverless/framework` ran before prepareDistributionTarballs.js.',
  )
}
const expected = [WEB_BRIDGE_ENTRY, WEB_BRIDGE_NOTICES]
if (
  JSON.stringify([...names].sort()) !== JSON.stringify([...expected].sort())
) {
  throw new Error(
    `${relative} holds ${JSON.stringify(names)}; it must hold ${expected.join(' and ')} alone, at its root`,
  )
}
console.log(`✓ packed framework ships the Dev Mode web bridge at ${relative}`)
