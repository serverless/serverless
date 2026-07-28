import { jest, describe, beforeEach, it, expect } from '@jest/globals'
import path from 'path'

jest.unstable_mockModule('fs-extra', () => ({
  default: {
    copy: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  },
}))

jest.unstable_mockModule(
  '../../../../../../lib/plugins/python/lib/zipTree.js',
  () => ({
    addTree: jest.fn(async (zip) => zip),
    writeZip: jest.fn(async () => {}),
  }),
)

const { default: fse } = await import('fs-extra')
const { addTree, writeZip } =
  await import('../../../../../../lib/plugins/python/lib/zipTree.js')
const { addVendorHelper, removeVendorHelper, packRequirements } =
  await import('../../../../../../lib/plugins/python/lib/zip.js')

describe('python zip helpers', () => {
  let context

  const createFunc = (module) => ({
    module,
    runtime: 'python3.12',
    package: { individually: true, patterns: [] },
  })

  beforeEach(() => {
    jest.clearAllMocks()
    context = {
      options: { zip: true, cleanupZipHelper: true },
      servicePath: path.join('/', 'service'),
      targetFuncs: [
        createFunc('module1'),
        createFunc('module1'),
        createFunc('module2'),
      ],
      serverless: {
        service: {
          provider: { runtime: 'python3.12' },
          package: {},
        },
      },
      log: { info: jest.fn() },
      progress: {
        get: jest.fn(() => ({ update: jest.fn(), remove: jest.fn() })),
      },
    }
  })

  describe('addVendorHelper', () => {
    it('copies the helper once per unique module', async () => {
      await addVendorHelper.call(context)

      expect(fse.copy).toHaveBeenCalledTimes(2)
      const destinations = fse.copy.mock.calls.map(([, dest]) => dest)
      expect(destinations).toEqual([
        path.join('/', 'service', 'module1', 'unzip_requirements.py'),
        path.join('/', 'service', 'module2', 'unzip_requirements.py'),
      ])
    })
  })

  describe('removeVendorHelper', () => {
    it('removes the helper once per unique module', async () => {
      await removeVendorHelper.call(context)

      expect(fse.remove).toHaveBeenCalledTimes(2)
      const removed = fse.remove.mock.calls.map(([target]) => target)
      expect(removed).toEqual([
        path.join('/', 'service', 'module1', 'unzip_requirements.py'),
        path.join('/', 'service', 'module2', 'unzip_requirements.py'),
      ])
    })
  })

  describe('packRequirements', () => {
    it('zips requirements once per unique module', async () => {
      await packRequirements.call(context)

      expect(addTree).toHaveBeenCalledTimes(2)
      expect(writeZip).toHaveBeenCalledTimes(2)
      const written = writeZip.mock.calls.map(([, dest]) => dest)
      expect(written).toEqual([
        path.join('/', 'service', 'module1', '.requirements.zip'),
        path.join('/', 'service', 'module2', '.requirements.zip'),
      ])
    })
  })
})
