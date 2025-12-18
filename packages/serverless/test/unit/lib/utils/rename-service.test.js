import {
  jest,
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
} from '@jest/globals'
import os from 'os'
import path from 'path'
import fs from 'fs'
import fsp from 'fs/promises'

// Import the function directly since it doesn't have complex dependencies
const { renameService } = await import(
  '../../../../lib/utils/rename-service.js'
)

describe('renameService', () => {
  let tmpDirPath
  let serviceDir

  function getTmpDirPath() {
    return path.join(
      os.tmpdir(),
      'serverless-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).slice(2),
    )
  }

  beforeEach(() => {
    tmpDirPath = getTmpDirPath()
    fs.mkdirSync(tmpDirPath, { recursive: true })
    serviceDir = tmpDirPath
  })

  afterEach(async () => {
    try {
      await fsp.rm(tmpDirPath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should set new service in serverless.yml and name in package.json and package-lock.json', () => {
    const defaultServiceYml =
      'someService: foo\notherservice: bar\nservice: service-name\n\nprovider:\n  name: aws'
    const newServiceYml =
      'someService: foo\notherservice: bar\nservice: new-service-name\n\nprovider:\n  name: aws'

    const defaultServiceName = 'service-name'
    const newServiceName = 'new-service-name'

    const packageFile = path.join(serviceDir, 'package.json')
    const packageLockFile = path.join(serviceDir, 'package-lock.json')
    const serviceFile = path.join(serviceDir, 'serverless.yml')

    fs.writeFileSync(packageFile, JSON.stringify({ name: defaultServiceName }))
    fs.writeFileSync(
      packageLockFile,
      JSON.stringify({ name: defaultServiceName }),
    )
    fs.writeFileSync(serviceFile, defaultServiceYml)

    renameService(newServiceName, serviceDir)

    const serviceYml = fs.readFileSync(serviceFile, 'utf-8')
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf-8'))
    const packageLockJson = JSON.parse(
      fs.readFileSync(packageLockFile, 'utf-8'),
    )

    expect(serviceYml).toBe(newServiceYml)
    expect(packageJson.name).toBe(newServiceName)
    expect(packageLockJson.name).toBe(newServiceName)
  })

  it('should set new service in serverless.ts and name in package.json and package-lock.json', () => {
    const defaultServiceTs =
      "const service = {\nservice: 'service-name',\n\nprovider: {\n  name: 'aws',\n}\n}\n"
    const newServiceTs =
      "const service = {\nservice: 'new-service-name',\n\nprovider: {\n  name: 'aws',\n}\n}\n"

    const defaultServiceName = 'service-name'
    const newServiceName = 'new-service-name'

    const packageFile = path.join(serviceDir, 'package.json')
    const packageLockFile = path.join(serviceDir, 'package-lock.json')
    const serviceFile = path.join(serviceDir, 'serverless.ts')

    fs.writeFileSync(packageFile, JSON.stringify({ name: defaultServiceName }))
    fs.writeFileSync(
      packageLockFile,
      JSON.stringify({ name: defaultServiceName }),
    )
    fs.writeFileSync(serviceFile, defaultServiceTs)

    renameService(newServiceName, serviceDir)

    const serviceTs = fs.readFileSync(serviceFile, 'utf-8')
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf-8'))
    const packageLockJson = JSON.parse(
      fs.readFileSync(packageLockFile, 'utf-8'),
    )

    expect(serviceTs).toBe(newServiceTs)
    expect(packageJson.name).toBe(newServiceName)
    expect(packageLockJson.name).toBe(newServiceName)
  })

  it('should set new service in commented serverless.yml and name in package.json and package-lock.json', () => {
    const defaultServiceYml =
      '# service: service-name #comment\n\nprovider:\n  name: aws\n# comment'
    const newServiceYml =
      '# service: new-service-name\n\nprovider:\n  name: aws\n# comment'

    const defaultServiceName = 'service-name'
    const newServiceName = 'new-service-name'

    const packageFile = path.join(serviceDir, 'package.json')
    const packageLockFile = path.join(serviceDir, 'package-lock.json')
    const serviceFile = path.join(serviceDir, 'serverless.yml')

    fs.writeFileSync(packageFile, JSON.stringify({ name: defaultServiceName }))
    fs.writeFileSync(
      packageLockFile,
      JSON.stringify({ name: defaultServiceName }),
    )
    fs.writeFileSync(serviceFile, defaultServiceYml)

    renameService(newServiceName, serviceDir)

    const serviceYml = fs.readFileSync(serviceFile, 'utf-8')
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf-8'))
    const packageLockJson = JSON.parse(
      fs.readFileSync(packageLockFile, 'utf-8'),
    )

    expect(serviceYml).toBe(newServiceYml)
    expect(packageJson.name).toBe(newServiceName)
    expect(packageLockJson.name).toBe(newServiceName)
  })

  it('should set new service in serverless.yml without existing package.json or package-lock.json', () => {
    const defaultServiceYml =
      '# service: service-name #comment\n\nprovider:\n  name: aws\n# comment'
    const newServiceYml =
      '# service: new-service-name\n\nprovider:\n  name: aws\n# comment'

    const serviceFile = path.join(serviceDir, 'serverless.yml')

    fs.writeFileSync(serviceFile, defaultServiceYml)

    renameService('new-service-name', serviceDir)

    const serviceYml = fs.readFileSync(serviceFile, 'utf-8')
    expect(serviceYml).toBe(newServiceYml)
  })

  it('should set new name of service (object syntax) in serverless.yml', () => {
    const defaultServiceYml =
      'service:\n  name: service-name\n\nprovider:\n  name: aws\n'
    const newServiceYml =
      'service:\n  name: new-service-name\n\nprovider:\n  name: aws\n'

    const defaultServiceName = 'service-name'
    const newServiceName = 'new-service-name'

    const packageFile = path.join(serviceDir, 'package.json')
    const packageLockFile = path.join(serviceDir, 'package-lock.json')
    const serviceFile = path.join(serviceDir, 'serverless.yml')

    fs.writeFileSync(packageFile, JSON.stringify({ name: defaultServiceName }))
    fs.writeFileSync(
      packageLockFile,
      JSON.stringify({ name: defaultServiceName }),
    )
    fs.writeFileSync(serviceFile, defaultServiceYml)

    renameService(newServiceName, serviceDir)

    const serviceYml = fs.readFileSync(serviceFile, 'utf-8')
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf-8'))
    const packageLockJson = JSON.parse(
      fs.readFileSync(packageLockFile, 'utf-8'),
    )

    expect(serviceYml).toBe(newServiceYml)
    expect(packageJson.name).toBe(newServiceName)
    expect(packageLockJson.name).toBe(newServiceName)
  })

  it('should set new name of service (object syntax) in serverless.ts', () => {
    const defaultServiceTs =
      "const service = {\nservice: {\n   name: 'service-name',\n},\nprovider: {\n  name: 'aws',\n}\n}\n"
    const newServiceTs =
      "const service = {\nservice: {\n   name: 'new-service-name',\n},\nprovider: {\n  name: 'aws',\n}\n}\n"

    const defaultServiceName = 'service-name'
    const newServiceName = 'new-service-name'

    const packageFile = path.join(serviceDir, 'package.json')
    const packageLockFile = path.join(serviceDir, 'package-lock.json')
    const serviceFile = path.join(serviceDir, 'serverless.ts')

    fs.writeFileSync(packageFile, JSON.stringify({ name: defaultServiceName }))
    fs.writeFileSync(
      packageLockFile,
      JSON.stringify({ name: defaultServiceName }),
    )
    fs.writeFileSync(serviceFile, defaultServiceTs)

    renameService(newServiceName, serviceDir)

    const serviceTs = fs.readFileSync(serviceFile, 'utf-8')
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf-8'))
    const packageLockJson = JSON.parse(
      fs.readFileSync(packageLockFile, 'utf-8'),
    )

    expect(serviceTs).toBe(newServiceTs)
    expect(packageJson.name).toBe(newServiceName)
    expect(packageLockJson.name).toBe(newServiceName)
  })

  it('should set new name of service in commented serverless.yml (object syntax)', () => {
    const defaultServiceYml =
      '# service:\n  name: service-name #comment\n\nprovider:\n  name: aws\n# comment'
    const newServiceYml =
      '# service:\n  name: new-service-name\n\nprovider:\n  name: aws\n# comment'

    const defaultServiceName = 'service-name'
    const newServiceName = 'new-service-name'

    const packageFile = path.join(serviceDir, 'package.json')
    const packageLockFile = path.join(serviceDir, 'package-lock.json')
    const serviceFile = path.join(serviceDir, 'serverless.yml')

    fs.writeFileSync(packageFile, JSON.stringify({ name: defaultServiceName }))
    fs.writeFileSync(
      packageLockFile,
      JSON.stringify({ name: defaultServiceName }),
    )
    fs.writeFileSync(serviceFile, defaultServiceYml)

    renameService(newServiceName, serviceDir)

    const serviceYml = fs.readFileSync(serviceFile, 'utf-8')
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf-8'))
    const packageLockJson = JSON.parse(
      fs.readFileSync(packageLockFile, 'utf-8'),
    )

    expect(serviceYml).toBe(newServiceYml)
    expect(packageJson.name).toBe(newServiceName)
    expect(packageLockJson.name).toBe(newServiceName)
  })

  it('should throw error when no serverless.yml or serverless.ts exists', () => {
    expect(() => renameService('new-service-name', serviceDir)).toThrow()
    try {
      renameService('new-service-name', serviceDir)
    } catch (error) {
      expect(error.code).toBe('MISSING_SERVICE_FILE')
    }
  })
})
