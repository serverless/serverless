import { readFile, writeFile, cp } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const installerPkg = JSON.parse(
  await readFile(
    path.resolve(__dirname, '../../../packages/sf-core-installer/package.json'),
    'utf8',
  ),
)

const frameworkDistPkgPath = path.resolve(
  __dirname,
  '../../../packages/framework-dist/package.json',
)
const frameworkDistPkg = JSON.parse(
  await readFile(frameworkDistPkgPath, 'utf8'),
)

frameworkDistPkg.author = installerPkg.author
frameworkDistPkg.repository = installerPkg.repository
frameworkDistPkg.engines = installerPkg.engines
frameworkDistPkg.keywords = installerPkg.keywords

await writeFile(
  frameworkDistPkgPath,
  `${JSON.stringify(frameworkDistPkg, null, 2)}\n`,
)

// Copy README from repo root
await cp(
  path.resolve(__dirname, '../../../README.md'),
  path.resolve(__dirname, '../../../packages/framework-dist/README.md'),
)

console.log(
  `Prepared npm package: ${frameworkDistPkg.name}@${frameworkDistPkg.version}`,
)
