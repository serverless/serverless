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
import JsZip from 'jszip'

// Mock @serverless/util
jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
    warning: jest.fn(),
    notice: jest.fn(),
    info: jest.fn(),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: {},
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
  getOrCreateGlobalDeploymentBucket: jest.fn(),
}))

const { default: Package } = await import(
  '../../../../../../lib/plugins/package/package.js'
)
const { default: Serverless } = await import(
  '../../../../../../lib/serverless.js'
)

describe('zipService', () => {
  let tmpDirPath
  let serverless
  let packagePlugin
  let params

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
    serverless = new Serverless({ commands: [], options: {} })
    serverless.service.service = 'first-service'
    serverless.serviceDir = tmpDirPath
    serverless.config = { serviceDir: tmpDirPath }
    serverless.utils = {
      writeFileSync: (filePath, content) => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, content)
      },
      writeFileDir: (filePath) => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
      },
    }
    packagePlugin = new Package(serverless, {})
    params = {
      include: ['user-defined-include-me'],
      exclude: ['user-defined-exclude-me'],
      zipFileName: 'my-service.zip',
    }
  })

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fsp.rm(tmpDirPath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('#zipService()', () => {
    it('should run promise chain in order', async () => {
      const excludeDevDependenciesSpy = jest
        .spyOn(packagePlugin, 'excludeDevDependencies')
        .mockResolvedValue(params)
      const zipSpy = jest.spyOn(packagePlugin, 'zip').mockResolvedValue()

      const { exclude, include, zipFileName } = params

      await packagePlugin.zipService(exclude, include, zipFileName)

      expect(excludeDevDependenciesSpy).toHaveBeenCalledTimes(1)
      expect(zipSpy).toHaveBeenCalledTimes(1)

      excludeDevDependenciesSpy.mockRestore()
      zipSpy.mockRestore()
    })
  })

  describe('#getFileContentAndStat()', () => {
    it('should keep the file content as is', async () => {
      const buf = Buffer.from([10, 20, 30, 40, 50])
      const filePath = path.join(tmpDirPath, 'bin-file')

      fs.writeFileSync(filePath, buf)

      const result = await packagePlugin.getFileContentAndStat('bin-file')
      expect(result.data).toEqual(buf)
    })

    it('should return file stat information', async () => {
      const filePath = path.join(tmpDirPath, 'test-file.js')
      fs.writeFileSync(filePath, 'console.log("test")')

      const result = await packagePlugin.getFileContentAndStat('test-file.js')
      expect(result.stat).toBeDefined()
      expect(result.stat.mode).toBeDefined()
      expect(result.filePath).toBe('test-file.js')
    })
  })

  describe('#excludeDevDependencies()', () => {
    it('should resolve when opted out of dev dependency exclusion', async () => {
      packagePlugin.serverless.service.package.excludeDevDependencies = false

      const updatedParams = await packagePlugin.excludeDevDependencies(params)
      expect(updatedParams).toEqual(params)
    })

    it('should return params unchanged if no package.json files found', async () => {
      // No package.json in tmpDirPath
      const updatedParams = await packagePlugin.excludeDevDependencies(params)

      expect(updatedParams.exclude).toContain('user-defined-exclude-me')
      expect(updatedParams.include).toContain('user-defined-include-me')
      expect(updatedParams.zipFileName).toBe(params.zipFileName)
    })
  })

  describe('#zip()', () => {
    const testDirectory = {
      '.': {
        'event.json': 'some content',
        'handler.js': 'some content',
        'file-1': 'some content',
        'file-2': 'some content',
      },
      bin: {
        'binary-777': { content: 'some content', permissions: 0o777 },
        'binary-444': { content: 'some content', permissions: 0o444 },
      },
      lib: {
        'file-1.js': 'some content',
      },
      'lib/directory-1': {
        'file-1.js': 'some content',
      },
      'node_modules/directory-1': {
        'file-1': 'some content',
        'file-2': 'some content',
      },
      'node_modules/directory-2': {
        'file-1': 'some content',
        'file-2': 'some content',
      },
    }

    function getTestArtifactFileName(testName) {
      return `test-${testName}-${Date.now()}.zip`
    }

    beforeEach(() => {
      Object.keys(testDirectory).forEach((dirName) => {
        const dirPath = path.join(tmpDirPath, dirName)
        const files = testDirectory[dirName]

        Object.keys(files).forEach((fileName) => {
          const filePath = path.join(dirPath, fileName)
          const fileValue = files[fileName]
          const file =
            typeof fileValue === 'object' ? fileValue : { content: fileValue }

          if (!file.content) {
            throw new Error('File content is required')
          }

          serverless.utils.writeFileSync(filePath, file.content)

          if (file.permissions) {
            fs.chmodSync(filePath, file.permissions)
          }
        })
      })
    })

    it('should zip a whole service (without include / exclude usage)', async () => {
      params.zipFileName = getTestArtifactFileName('whole-service')

      const artifact = await packagePlugin.zip(params)
      expect(artifact).toBe(
        path.join(serverless.serviceDir, '.serverless', params.zipFileName),
      )

      const data = fs.readFileSync(artifact)
      const zip = new JsZip()
      const unzippedData = await zip.loadAsync(data)
      const unzippedFileData = unzippedData.files

      const fileCount = Object.keys(unzippedFileData).filter(
        (file) => !unzippedFileData[file].dir,
      ).length
      expect(fileCount).toBe(12)

      // root directory
      expect(unzippedFileData['event.json']).toBeDefined()
      expect(unzippedFileData['handler.js']).toBeDefined()
      expect(unzippedFileData['file-1']).toBeDefined()
      expect(unzippedFileData['file-2']).toBeDefined()

      // bin directory
      expect(unzippedFileData['bin/binary-777']).toBeDefined()
      expect(unzippedFileData['bin/binary-444']).toBeDefined()

      // lib directory
      expect(unzippedFileData['lib/file-1.js']).toBeDefined()
      expect(unzippedFileData['lib/directory-1/file-1.js']).toBeDefined()

      // node_modules directory
      expect(unzippedFileData['node_modules/directory-1/file-1']).toBeDefined()
      expect(unzippedFileData['node_modules/directory-1/file-2']).toBeDefined()
      expect(unzippedFileData['node_modules/directory-2/file-1']).toBeDefined()
      expect(unzippedFileData['node_modules/directory-2/file-2']).toBeDefined()
    })

    it('should keep file permissions', async () => {
      if (os.platform() === 'win32') {
        // chmod does not work right on windows
        return
      }

      params.zipFileName = getTestArtifactFileName('file-permissions')

      const artifact = await packagePlugin.zip(params)
      const data = fs.readFileSync(artifact)
      const zip = new JsZip()
      const unzippedData = await zip.loadAsync(data)
      const unzippedFileData = unzippedData.files

      // binary file is set with chmod of 777 -> should be 755 in zip
      expect(unzippedFileData['bin/binary-777'].unixPermissions).toBe(
        Math.pow(2, 15) + 0o755,
      )

      // read only file is set with chmod of 444 -> should be 644 in zip
      expect(unzippedFileData['bin/binary-444'].unixPermissions).toBe(
        Math.pow(2, 15) + 0o644,
      )
    })

    it('should exclude with globs', async () => {
      params.zipFileName = getTestArtifactFileName('exclude-with-globs')
      params.exclude = ['event.json', 'lib/**', 'node_modules/directory-1/**']

      const artifact = await packagePlugin.zip(params)
      const data = fs.readFileSync(artifact)
      const zip = new JsZip()
      const unzippedData = await zip.loadAsync(data)
      const unzippedFileData = unzippedData.files

      const fileCount = Object.keys(unzippedFileData).filter(
        (file) => !unzippedFileData[file].dir,
      ).length
      expect(fileCount).toBe(7)

      // root directory
      expect(unzippedFileData['handler.js']).toBeDefined()
      expect(unzippedFileData['file-1']).toBeDefined()
      expect(unzippedFileData['file-2']).toBeDefined()

      // bin directory
      expect(unzippedFileData['bin/binary-777']).toBeDefined()
      expect(unzippedFileData['bin/binary-444']).toBeDefined()

      // node_modules directory
      expect(unzippedFileData['node_modules/directory-2/file-1']).toBeDefined()
      expect(unzippedFileData['node_modules/directory-2/file-2']).toBeDefined()

      // excluded
      expect(unzippedFileData['event.json']).toBeUndefined()
      expect(unzippedFileData['lib/file-1.js']).toBeUndefined()
      expect(
        unzippedFileData['node_modules/directory-1/file-1'],
      ).toBeUndefined()
    })

    it('should re-include files using ! glob pattern', async () => {
      params.zipFileName = getTestArtifactFileName('re-include-with-globs')
      params.exclude = [
        'event.json',
        'lib/**',
        'node_modules/directory-1/**',
        '!event.json', // re-include
        '!lib/**', // re-include
      ]

      const artifact = await packagePlugin.zip(params)
      const data = fs.readFileSync(artifact)
      const zip = new JsZip()
      const unzippedData = await zip.loadAsync(data)
      const unzippedFileData = unzippedData.files

      const fileCount = Object.keys(unzippedFileData).filter(
        (file) => !unzippedFileData[file].dir,
      ).length
      expect(fileCount).toBe(10)

      // root directory (re-included)
      expect(unzippedFileData['event.json']).toBeDefined()
      expect(unzippedFileData['handler.js']).toBeDefined()

      // lib directory (re-included)
      expect(unzippedFileData['lib/file-1.js']).toBeDefined()
      expect(unzippedFileData['lib/directory-1/file-1.js']).toBeDefined()

      // node_modules directory (directory-1 still excluded)
      expect(unzippedFileData['node_modules/directory-2/file-1']).toBeDefined()
      expect(
        unzippedFileData['node_modules/directory-1/file-1'],
      ).toBeUndefined()
    })

    it('should re-include files using include config', async () => {
      params.zipFileName = getTestArtifactFileName('re-include-with-include')
      params.exclude = ['event.json', 'lib/**', 'node_modules/directory-1/**']
      params.include = ['event.json', 'lib/**']

      const artifact = await packagePlugin.zip(params)
      const data = fs.readFileSync(artifact)
      const zip = new JsZip()
      const unzippedData = await zip.loadAsync(data)
      const unzippedFileData = unzippedData.files

      const fileCount = Object.keys(unzippedFileData).filter(
        (file) => !unzippedFileData[file].dir,
      ).length
      expect(fileCount).toBe(10)

      // root directory (re-included)
      expect(unzippedFileData['event.json']).toBeDefined()

      // lib directory (re-included)
      expect(unzippedFileData['lib/file-1.js']).toBeDefined()
    })

    it('should throw an error if no files are matched', async () => {
      params.exclude = ['**/**']
      params.include = []
      params.zipFileName = getTestArtifactFileName('empty')

      await expect(packagePlugin.zip(params)).rejects.toThrow(
        /file matches include \/ exclude/,
      )
    })
  })

  describe('#zipFiles()', () => {
    it('should throw an error if no files are provided', async () => {
      await expect(
        packagePlugin.zipFiles([], path.resolve(tmpDirPath, 'tmp.zip')),
      ).rejects.toThrow(/No files to package/)
    })
  })
})
