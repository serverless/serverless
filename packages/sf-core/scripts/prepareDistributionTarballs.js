import fsp from 'fs/promises'
import { execFileSync, execSync } from 'child_process'
import { createHash } from 'crypto'
import { createRequire } from 'module'
import { glob } from 'glob'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const { readFile, writeFile, cp, mkdir, chmod } = fsp

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Resolve packages from packages/serverless, not from framework-dist (which has no deps).
// Both ajv and esbuild are dependencies of packages/serverless.
const resolveFromServerless = createRequire(
  path.resolve(__dirname, '../../serverless/package.json'),
)

const sfCorePackageJson = JSON.parse(await readFile('../package.json', 'utf8'))
let version = sfCorePackageJson.version

// Handle canary builds
if (process.env.IS_CANARY === 'true') {
  const gitSha = execSync('git rev-parse --short HEAD').toString().trim()
  version = `${gitSha}`
}

const frameworkDistPackageJson = JSON.parse(
  await readFile('../../framework-dist/package.json', 'utf8'),
)

frameworkDistPackageJson.version = version

await writeFile(
  '../../framework-dist/package.json',
  `${JSON.stringify(frameworkDistPackageJson, null, 2)}\n`,
)

const files = await glob('../../serverless/lib/plugins/aws/package/lib/*.json')

const cpPromises = files.map((file) => {
  const fileName = path.basename(file)
  return cp(
    file,
    `../../framework-dist/lib/plugins/aws/package/lib/${fileName}`,
  )
})

cpPromises.push(
  cp(
    '../../serverless/lib/plugins/aws/invoke-local/runtime-wrappers',
    '../../framework-dist/lib/plugins/aws/invoke-local/runtime-wrappers',
    { recursive: true },
  ),
)
cpPromises.push(
  cp(
    '../../serverless/lib/plugins/aws/custom-resources/resources',
    '../../framework-dist/lib/plugins/aws/custom-resources/resources',
    { recursive: true },
  ),
)
cpPromises.push(
  cp(
    '../../serverless/lib/plugins/aws/dev/shim.min.js',
    '../../framework-dist/lib/plugins/aws/dev/shim.min.js',
  ),
)
cpPromises.push(
  cp(
    '../../serverless/lib/plugins/aws/dev/local-lambda/runtime-wrappers/node.js',
    '../../framework-dist/lib/plugins/aws/dev/local-lambda/runtime-wrappers/node.js',
  ),
)

cpPromises.push(
  cp(
    '../src/lib/runners/cfn/aws/statuses.json',
    '../../framework-dist/dist/statuses.json',
  ),
)

cpPromises.push(
  cp(
    '../src/lib/runners/cfn/aws/base.json',
    '../../framework-dist/dist/base.json',
  ),
)

// `serverless diff` needs the AWS resource-spec database shipped alongside
// the bundle. The library reads the file via a `__dirname`-relative path
// from inside the bundled code; when sf-core.js is loaded from
// `<package>/dist/`, that path resolves to `<package>/db.json.gz`. Copy it
// there so the diff command can render structured output against deployed
// stacks.
cpPromises.push(
  cp(
    resolveFromServerless.resolve('@aws-cdk/aws-service-spec/db.json.gz'),
    '../../framework-dist/db.json.gz',
  ),
)

// Copy Python plugin files
cpPromises.push(
  cp(
    '../../serverless/lib/plugins/python/unzip_requirements.py',
    '../../framework-dist/lib/plugins/python/unzip_requirements.py',
  ),
)

// Copy docs directory for the docs tool in MCP server
cpPromises.push(
  cp('../../../docs', '../../framework-dist/docs', { recursive: true }),
)

await Promise.all(cpPromises)

// --- Ship ajv runtime files needed by standalone validators generated at runtime ---
// Cached validators contain require("ajv/dist/runtime/equal"),
// require("ajv/dist/runtime/ucs2length"), and require("ajv-formats/dist/formats").
const distNodeModules = '../../framework-dist/dist/node_modules'

await Promise.all([
  mkdir(`${distNodeModules}/ajv/dist/runtime`, { recursive: true }),
  mkdir(`${distNodeModules}/ajv-formats/dist`, { recursive: true }),
  mkdir(`${distNodeModules}/fast-deep-equal`, { recursive: true }),
])

// Resolve package versions from workspace node_modules (not framework-dist)
const ajvPkg = JSON.parse(
  await readFile(resolveFromServerless.resolve('ajv/package.json'), 'utf8'),
)
const ajvFormatsPkg = JSON.parse(
  await readFile(
    resolveFromServerless.resolve('ajv-formats/package.json'),
    'utf8',
  ),
)

await Promise.all([
  cp(
    resolveFromServerless.resolve('ajv/dist/runtime/equal'),
    `${distNodeModules}/ajv/dist/runtime/equal.js`,
  ),
  cp(
    resolveFromServerless.resolve('ajv/dist/runtime/ucs2length'),
    `${distNodeModules}/ajv/dist/runtime/ucs2length.js`,
  ),
  cp(
    resolveFromServerless.resolve('ajv-formats/dist/formats'),
    `${distNodeModules}/ajv-formats/dist/formats.js`,
  ),
  cp(
    resolveFromServerless.resolve('fast-deep-equal'),
    `${distNodeModules}/fast-deep-equal/index.js`,
  ),
  writeFile(
    `${distNodeModules}/ajv/package.json`,
    JSON.stringify({ name: 'ajv', version: ajvPkg.version }) + '\n',
  ),
  writeFile(
    `${distNodeModules}/ajv-formats/package.json`,
    JSON.stringify({
      name: 'ajv-formats',
      version: ajvFormatsPkg.version,
    }) + '\n',
  ),
  writeFile(
    `${distNodeModules}/fast-deep-equal/package.json`,
    JSON.stringify({ name: 'fast-deep-equal', main: 'index.js' }) + '\n',
  ),
])

// --- Ship esbuild's Node API as a sibling file ---
// sf-core.js marks esbuild as external (see packages/sf-core/esbuild.js) so
// that __filename inside esbuild's Worker spawn resolves to esbuild's own
// runtime entry, not the framework bundle. Without this, esbuild's
// transformSync would re-execute the entire CLI inside the Worker. See
// issue #13574 and upstream esbuild's "cannot be bundled" guard.
//
// Copy the entire esbuild package minus `bin/`. The `bin/` entry holds
// the build-host's native binary, which we don't need — the per-platform
// binaries are shipped separately below into `@esbuild/<platform>/`,
// which is what esbuild's runtime resolves via
// `require.resolve('@esbuild/<platform>/…')`. Everything else (lib/,
// package.json, LICENSE, README, etc.) ships verbatim so we stay correct
// even if upstream reorganizes the JS or adds new files.
const esbuildPkgPath = resolveFromServerless.resolve('esbuild/package.json')
const esbuildSrcDir = path.dirname(esbuildPkgPath)
const esbuildPkg = JSON.parse(await readFile(esbuildPkgPath, 'utf8'))
const esbuildDistDir = `${distNodeModules}/esbuild`

await cp(esbuildSrcDir, esbuildDistDir, {
  recursive: true,
  filter: (src) => {
    const [first] = path.relative(esbuildSrcDir, src).split(path.sep)
    return first !== 'bin'
  },
})

// --- Download esbuild platform binaries for all 5 supported platforms ---
const esbuildVersion = esbuildPkg.version

// Load the workspace's package-lock.json so we can verify each downloaded
// tarball against the integrity hash npm recorded at install time. Same trust
// anchor as `npm install` — protects against registry tampering between install
// and release builds.
const packageLock = JSON.parse(
  await readFile(path.resolve(__dirname, '../../../package-lock.json'), 'utf8'),
)

function expectedIntegrity(pkg) {
  const entry = packageLock.packages?.[`node_modules/@esbuild/${pkg}`]
  if (!entry?.integrity) {
    throw new Error(
      `package-lock.json has no integrity hash for @esbuild/${pkg}. Run \`npm install\` to regenerate.`,
    )
  }
  // SRI format: "<algo>-<base64>"
  const [algo, expected] = entry.integrity.split('-', 2)
  if (!algo || !expected) {
    throw new Error(
      `Malformed integrity for @esbuild/${pkg}: ${entry.integrity}`,
    )
  }
  return { algo, expected }
}

const platforms = [
  { pkg: 'darwin-arm64', binary: 'bin/esbuild' },
  { pkg: 'darwin-x64', binary: 'bin/esbuild' },
  { pkg: 'linux-arm64', binary: 'bin/esbuild' },
  { pkg: 'linux-x64', binary: 'bin/esbuild' },
  { pkg: 'win32-x64', binary: 'esbuild.exe' },
]

async function downloadEsbuildBinary(pkg, binary) {
  const tarballUrl = `https://registry.npmjs.org/@esbuild/${pkg}/-/${pkg}-${esbuildVersion}.tgz`
  const destDir = `${distNodeModules}/@esbuild/${pkg}`
  const destPath = path.join(destDir, binary)
  const { algo, expected } = expectedIntegrity(pkg)

  await mkdir(path.dirname(destPath), { recursive: true })

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), `esbuild-${pkg}-`))
  const tmpTarball = path.join(tmpDir, `${pkg}-${esbuildVersion}.tgz`)

  const response = await fetch(tarballUrl)
  if (!response.ok) {
    throw new Error(
      `Failed to download ${tarballUrl}: ${response.status} ${response.statusText}`,
    )
  }
  const tarballBuffer = Buffer.from(await response.arrayBuffer())

  // Verify integrity before writing to disk.
  const actual = createHash(algo).update(tarballBuffer).digest('base64')
  if (actual !== expected) {
    throw new Error(
      `Integrity check failed for @esbuild/${pkg}@${esbuildVersion}\n  expected: ${algo}-${expected}\n  got:      ${algo}-${actual}`,
    )
  }

  await writeFile(tmpTarball, tarballBuffer)

  execFileSync('tar', [
    'xzf',
    tmpTarball,
    '-C',
    destDir,
    '--strip-components=1',
    `package/${binary}`,
  ])
  await chmod(destPath, 0o755)
  await fsp.rm(tmpDir, { recursive: true })

  console.log(`  Downloaded @esbuild/${pkg}@${esbuildVersion} -> ${destPath}`)
}

await Promise.all(
  platforms.map(({ pkg, binary }) => downloadEsbuildBinary(pkg, binary)),
)
