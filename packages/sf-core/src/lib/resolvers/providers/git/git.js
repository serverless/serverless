import { AbstractProvider } from '../index.js'
import { promisify } from 'util'
import { exec } from 'child_process'
import path from 'path'
import * as os from 'node:os'
const execP = promisify(exec)

export class Git extends AbstractProvider {
  static type = 'git'
  static resolvers = ['git']
  static defaultResolver = 'git'

  static validateConfig(providerConfig) {}

  resolveVariable = ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'git') {
      return resolveVariableFromGit(key, this.configFileDirPath)
    }
    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const resolveVariableFromGit = async (key, configFileDirPath) => {
  let value = null
  const execInConfigDir = (command) =>
    execP(command, { cwd: configFileDirPath })

  switch (key) {
    case 'describe':
      value = await execInConfigDir('git describe --always')
      break
    case 'describeLight':
      value = await execInConfigDir('git describe --always --tags')
      break
    case 'sha1':
      value = await execInConfigDir('git rev-parse --short HEAD')
      break
    case 'commit':
      value = await execInConfigDir('git rev-parse HEAD')
      break
    case 'branch':
      value = await execInConfigDir('git rev-parse --abbrev-ref HEAD')
      break
    case 'message':
      value = await execInConfigDir('git log -1 --pretty=%B')
      break
    case 'messageSubject':
      value = await execInConfigDir('git log -1 --pretty=%s')
      break
    case 'messageBody':
      value = await execInConfigDir('git log -1 --pretty=%b')
      break
    case 'user':
      value = await execInConfigDir('git config user.name')
      break
    case 'email':
      value = await execInConfigDir('git config user.email')
      break
    case 'isDirty': {
      const changes = await execInConfigDir('git diff --stat')
      value = { stdout: `${changes.length > 0}` }
      break
    }
    case 'repository': {
      const pathName = await execInConfigDir('git rev-parse --show-toplevel')
      value = { stdout: path.basename(pathName.stdout) }
      break
    }
    case 'tags':
      value = await execInConfigDir('git tag --points-at HEAD')
      value = { stdout: value?.stdout?.split(os.EOL).join('::').slice(0, -2) }
      if (!value?.stdout) {
        value = await execInConfigDir('git rev-parse --short HEAD')
      }
      break
    default:
      throw new Error(
        `Git variable ${key} is unknown. Candidates are 'describe', 'describeLight', 'sha1', 'commit', 'branch', 'message', 'messageSubject', 'messageBody', 'user', 'email', 'isDirty', 'repository', 'tags'`,
      )
  }
  return value.stdout.trim()
}
