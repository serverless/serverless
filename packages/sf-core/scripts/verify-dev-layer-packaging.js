// packages/sf-core/scripts/verify-dev-layer-packaging.js
/**
 * Proves the Dev Mode layer zips ship where the released CLI looks for them. The bundled plugin
 * resolves them from `<package>/dist` through the source-tree layout (`layerArtifactPathFrom` in
 * packages/serverless/lib/plugins/aws/dev/attach/naming.js); a release that copies them anywhere
 * else fails every `serverless dev` with DEV_MODE_LAYER_MISSING, and no PR CI runs the release.
 * Usage: node verify-dev-layer-packaging.js <path-to-extracted-package-dir>
 */
import { readFile } from 'fs/promises'
import path from 'path'
import AdmZip from 'adm-zip'
import {
  ARCHITECTURES,
  layerArtifactPathFrom,
} from '../../serverless/lib/plugins/aws/dev/attach/naming.js'

const packageDir = process.argv[2]
if (!packageDir) {
  console.error(
    'Usage: node verify-dev-layer-packaging.js <extracted package dir>',
  )
  process.exit(1)
}

const bundleDir = path.join(path.sep, 'package', 'dist')
for (const arch of ARCHITECTURES) {
  const relative = path.relative(
    path.dirname(bundleDir),
    layerArtifactPathFrom(bundleDir, arch),
  )
  let entries
  try {
    const zip = new AdmZip(await readFile(path.join(packageDir, relative)))
    entries = Object.fromEntries(
      zip
        .getEntries()
        .map((e) => [e.entryName, (e.header.attr >>> 16) & 0o777]),
    )
  } catch (error) {
    throw new Error(
      `the Dev Mode layer zip at "${relative}" is missing or unreadable in the packed framework (${error.message}).\n` +
        'Check that `npm run build:devmode:layer -w @serverless/framework` ran before prepareDistributionTarballs.js.',
    )
  }
  for (const name of ['sls-dev-wrapper', 'bin/sls-dev-bridge']) {
    if (entries[name] !== 0o755) {
      throw new Error(`${relative}: ${name} is missing or not executable`)
    }
  }
  // The licences of everything the bridge links ship next to it.
  if (entries['sls-dev-THIRD_PARTY_NOTICES'] !== 0o644) {
    throw new Error(
      `${relative}: sls-dev-THIRD_PARTY_NOTICES is missing or not mode 0644`,
    )
  }
  console.log(
    `✓ packed framework ships the Dev Mode layer for ${arch} at ${relative}`,
  )
}
