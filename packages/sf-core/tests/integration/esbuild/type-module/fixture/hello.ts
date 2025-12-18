/**
 * This test makes sure that package.json exists in the bundle
 * because it has type: module and is needed by AWS Lambda to read the ESM
 */

import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function readPackageJson() {
  const packageJsonPath = resolve(__dirname, 'package.json')
  const data = await readFile(packageJsonPath, 'utf-8')
  const packageJson = JSON.parse(data)
  return packageJson
}

export const handler = async (event: any) => {
  const packageJson = await readPackageJson()

  if (packageJson.type === 'module') {
    // if package.json exists and has type: module, return it
    return packageJson
  }
}
