import fsp from 'fs/promises'
import { execFileSync, execSync } from 'child_process'
import { createRequire } from 'module'
import { glob } from 'glob'
import os from 'os'
import path from 'path'

const { readFile, writeFile, cp, mkdir, chmod } = fsp

// Resolve packages from the workspace, not from framework-dist (which has no deps).
// ajv is a dep of packages/serverless; esbuild is a devDep of packages/sf-core.
const serverlessRequire = createRequire(
  path.resolve(import.meta.dirname, '../../serverless/package.json'),
)
const sfCoreRequire = createRequire(
  path.resolve(import.meta.dirname, '../package.json'),
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
    '../../engine/src/lib/devMode/containers',
    '../../framework-dist/dist/containers',
    {
      recursive: true,
    },
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
  await readFile(serverlessRequire.resolve('ajv/package.json'), 'utf8'),
)
const ajvFormatsPkg = JSON.parse(
  await readFile(serverlessRequire.resolve('ajv-formats/package.json'), 'utf8'),
)

await Promise.all([
  cp(
    serverlessRequire.resolve('ajv/dist/runtime/equal'),
    `${distNodeModules}/ajv/dist/runtime/equal.js`,
  ),
  cp(
    serverlessRequire.resolve('ajv/dist/runtime/ucs2length'),
    `${distNodeModules}/ajv/dist/runtime/ucs2length.js`,
  ),
  cp(
    serverlessRequire.resolve('ajv-formats/dist/formats'),
    `${distNodeModules}/ajv-formats/dist/formats.js`,
  ),
  cp(
    serverlessRequire.resolve('fast-deep-equal'),
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

// --- Download esbuild platform binaries for all 5 supported platforms ---
const esbuildPkg = JSON.parse(
  await readFile(sfCoreRequire.resolve('esbuild/package.json'), 'utf8'),
)
const esbuildVersion = esbuildPkg.version

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
