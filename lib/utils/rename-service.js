import path from 'path'
import fse from 'fs-extra'
import fileExistsSync from './fs/file-exists-sync.js'
import readFileSync from './fs/read-file-sync.js'
import writeFileSync from './fs/write-file-sync.js'
import ServerlessError from '../serverless-error.js'

function renameYmlService(name, ymlServiceFile) {
  const serverlessYml = fse
    .readFileSync(ymlServiceFile, 'utf-8')
    .replace(
      /(^|\s|#)service\s*:.+/,
      (ignore, prefix) => `${prefix}service: ${name}`,
    )
    .replace(
      /(^|\s|#)service\s*:\s*\n(\s+)name:.+/,
      (match, prefix, indent) => `${prefix}service:\n${indent}name: ${name}`,
    )

  fse.writeFileSync(ymlServiceFile, serverlessYml)
}

function renameTsService(name, tsServicefile) {
  const serverlessTs = fse
    .readFileSync(tsServicefile, 'utf-8')
    .replace(
      /(^|\s)service\s*:\s*('|").+('|")/,
      (ignore, prefix) => `${prefix}service: '${name}'`,
    )
    .replace(
      /(^|\s)service\s*:\s*{\s*\n(\s+)name:\s*('|").+('|")/,
      (match, prefix, indent) =>
        `${prefix}service: {\n${indent}name: '${name}'`,
    )

  fse.writeFileSync(tsServicefile, serverlessTs)
}

export const renameService = (name, serviceDir) => {
  const packageFile = path.join(serviceDir, 'package.json')
  if (fileExistsSync(packageFile)) {
    const json = readFileSync(packageFile)
    writeFileSync(packageFile, Object.assign(json, { name }))
  }
  const packageLockFile = path.join(serviceDir, 'package-lock.json')
  if (fileExistsSync(packageLockFile)) {
    const json = readFileSync(packageLockFile)
    writeFileSync(packageLockFile, Object.assign(json, { name }))
  }

  const ymlServiceFile = path.join(serviceDir, 'serverless.yml')
  if (fileExistsSync(ymlServiceFile)) {
    renameYmlService(name, ymlServiceFile)
    return name
  }

  const tsServiceFile = path.join(serviceDir, 'serverless.ts')
  if (fileExistsSync(tsServiceFile)) {
    renameTsService(name, tsServiceFile)
    return name
  }

  const errorMessage = [
    'serverless.yml or serverlss.ts not found in',
    ` ${serviceDir}`,
  ].join('')
  throw new ServerlessError(errorMessage, 'MISSING_SERVICE_FILE')
}
