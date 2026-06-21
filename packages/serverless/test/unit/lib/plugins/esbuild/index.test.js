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

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
  },
}))

const { default: Esbuild } =
  await import('../../../../../lib/plugins/esbuild/index.js')

describe('Esbuild', () => {
  let tmpDirPath
  let serverless
  let esbuildPlugin

  function getTmpDirPath() {
    return path.join(
      os.tmpdir(),
      'serverless-esbuild-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).slice(2),
    )
  }

  function writeFile(filePath, content = '') {
    const absolutePath = path.join(tmpDirPath, filePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content)
  }

  function writeBuildOutput() {
    writeFile('.serverless/build/package.json', '{}')
    writeFile('.serverless/build/src/api/handler.js', 'exports.main = () => {}')
    writeFile('.serverless/build/src/api/handler.js.map', '{}')
    writeFile('.serverless/build/src/locales/en.json', '{"locale":"en"}')
    writeFile(
      '.serverless/build/src/workers/locales/en.json',
      '{"locale":"en"}',
    )
    writeFile(
      '.serverless/build/node_modules/pkg/index.js',
      'module.exports = {}',
    )
  }

  async function expectZipIncludesBuildOutput(artifact) {
    const data = fs.readFileSync(artifact)
    const zip = new JsZip()
    const unzippedData = await zip.loadAsync(data)
    const unzippedFileData = unzippedData.files

    expect(unzippedFileData['src/api/handler.js']).toBeDefined()
    expect(unzippedFileData['src/api/handler.js.map']).toBeDefined()
    expect(unzippedFileData['src/locales/en.json']).toBeDefined()
    expect(unzippedFileData['src/workers/locales/en.json']).toBeDefined()
    expect(unzippedFileData['node_modules/pkg/index.js']).toBeDefined()
  }

  beforeEach(() => {
    tmpDirPath = getTmpDirPath()
    fs.mkdirSync(tmpDirPath, { recursive: true })

    serverless = {
      serviceDir: tmpDirPath,
      config: { serviceDir: tmpDirPath },
      service: {
        service: 'test-service',
        package: { patterns: [] },
      },
      pluginManager: {
        spawn: jest.fn(),
      },
    }
    esbuildPlugin = new Esbuild(serverless, {})
  })

  afterEach(async () => {
    await fsp.rm(tmpDirPath, { recursive: true, force: true })
  })

  describe('#_packageAll()', () => {
    it('should include files emitted to the build directory besides handlers', async () => {
      writeBuildOutput()

      await esbuildPlugin._packageAll({
        api: { handler: 'src/api/handler.main' },
      })

      await expectZipIncludesBuildOutput(serverless.service.package.artifact)
    })
  })

  describe('#_package()', () => {
    it('should include files emitted to the build directory when packaging individually', async () => {
      writeBuildOutput()
      serverless.service.package.individually = true

      const functionObject = { handler: 'src/api/handler.main' }
      jest.spyOn(esbuildPlugin, 'functions').mockResolvedValue({
        api: functionObject,
      })
      jest.spyOn(esbuildPlugin, '_buildProperties').mockResolvedValue({})

      await esbuildPlugin._package()

      await expectZipIncludesBuildOutput(functionObject.package.artifact)
    })
  })
})
