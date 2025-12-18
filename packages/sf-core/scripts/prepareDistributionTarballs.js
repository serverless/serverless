import { readFile, writeFile, cp } from 'fs/promises'
import { glob } from 'glob'
import path from 'path'
import { execSync } from 'child_process'

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
