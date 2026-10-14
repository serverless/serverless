// packages/sf-core/scripts/verify-dev-local-packaging.js
/**
 * Proves the released CLI can start handler processes on the developer's machine. The bundled
 * plugin finds the runtime clients from `<package>/dist` through the source-tree layout
 * (`clientPathFrom` in packages/serverless/lib/plugins/aws/dev/local/paths.js), and starts
 * TypeScript handlers with the tsx loader resolved from the bundle; a release that ships either
 * anywhere else breaks every invocation on the laptop, and no PR CI runs the release.
 * Usage: node verify-dev-local-packaging.js <path-to-extracted-package-dir>
 */
import { execFileSync } from 'child_process'
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import {
  CLIENT_FILES,
  clientPathFrom,
} from '../../serverless/lib/plugins/aws/dev/local/paths.js'

if (!process.argv[2]) {
  console.error(
    'Usage: node verify-dev-local-packaging.js <extracted package dir>',
  )
  process.exit(1)
}
const fail = (message) => {
  console.error(message)
  process.exit(1)
}
// Absolute, because `createRequire` below rejects a relative path and callers pass `package`;
// and real, because module resolution returns real paths, so a package reached through a
// symlink (macOS `/tmp` and `/var`) would otherwise look like tsx resolved outside it.
let packageDir
try {
  packageDir = realpathSync(path.resolve(process.argv[2]))
} catch (error) {
  fail(`cannot read the extracted package directory (${error.message}).`)
}

const bundleDir = path.join(path.sep, 'package', 'dist')
for (const name of Object.values(CLIENT_FILES)) {
  const relative = path.relative(
    path.dirname(bundleDir),
    clientPathFrom(bundleDir, name),
  )
  if (!existsSync(path.join(packageDir, relative))) {
    fail(
      `the Dev Mode runtime client "${relative}" is missing in the packed framework; register it in prepareDistributionTarballs.js.`,
    )
  }
  console.log(
    `✓ packed framework ships the Dev Mode runtime client ${relative}`,
  )
}

let loader
try {
  loader = createRequire(path.join(packageDir, 'dist', 'sf-core.js')).resolve(
    'tsx',
  )
} catch (error) {
  fail(
    `the packed framework has no tsx next to its bundle (${error.message}); copy it in prepareDistributionTarballs.js.`,
  )
}
if (
  !loader.startsWith(path.join(packageDir, 'dist', 'node_modules') + path.sep)
) {
  fail(
    `tsx resolved outside the packed framework (${loader}); it must ship in dist/node_modules/tsx.`,
  )
}
const dir = mkdtempSync(path.join(os.tmpdir(), 'sls-verify-tsx-'))
try {
  const file = path.join(dir, 'check.ts')
  writeFileSync(
    file,
    "enum Answer {\n  Yes = 'yes',\n}\nconsole.log(Answer.Yes)\n",
  )
  const printed = execFileSync(
    process.execPath,
    ['--import', pathToFileURL(loader).href, file],
    { encoding: 'utf8' },
  ).trim()
  if (printed !== 'yes') {
    fail(`the packed TypeScript loader printed "${printed}", expected "yes"`)
  }
  console.log(
    '✓ packed framework ships a working TypeScript loader for Dev Mode handler processes',
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}
