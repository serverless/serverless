import { jest } from '@jest/globals'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import yamlAstParser from '../../../../src/utils/fs/yaml-ast-parser.js'
import { writeFile, readFile } from '../../../../src/utils/fs/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const tmpDir = path.join(__dirname, 'tmp-yaml-ast')

describe('yamlAstParser', () => {
  beforeEach(async () => {
    await fs.ensureDir(tmpDir)
  })

  afterEach(async () => {
    await fs.remove(tmpDir)
  })

  describe('addNewArrayItem', () => {
    const addNewArrayItemAndVerifyResult = async (
      yamlContent,
      pathInYaml,
      newItem,
      expectedResult,
    ) => {
      const yamlFilePath = path.join(tmpDir, 'test.yaml')
      await writeFile(yamlFilePath, yamlContent)
      await yamlAstParser.addNewArrayItem(yamlFilePath, pathInYaml, newItem)

      const yaml = await fs.readFile(yamlFilePath, 'utf8')
      const { load } = await import('js-yaml')
      const parsed = load(yaml)
      expect(parsed).toEqual(expectedResult)
    }

    it('should add a top level object and item into the yaml file', async () => {
      const yamlContent = { service: 'test-service' }
      const expectedResult = Object.assign({}, yamlContent, {
        toplevel: ['foo'],
      })
      await addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel',
        'foo',
        expectedResult,
      )
    })

    it('should add an item under the existing object which you specify', async () => {
      const yamlContent = { toplevel: ['foo'] }
      const expectedResult = { toplevel: ['foo', 'bar'] }
      await addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel',
        'bar',
        expectedResult,
      )
    })

    it('should add a multiple level object and item into the yaml file', async () => {
      const yamlContent = { service: 'test-service' }
      const expectedResult = Object.assign({}, yamlContent, {
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
      })
      await addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'foo',
        expectedResult,
      )
    })

    it('should add an item under the existing multiple level object which you specify', async () => {
      const yamlContent = {
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
      }
      const expectedResult = {
        toplevel: {
          second: {
            third: ['foo', 'bar'],
          },
        },
      }
      await addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'bar',
        expectedResult,
      )
    })

    it('should add an item under partially existing multiple level object', async () => {
      const yamlContent = {
        toplevel: {
          first: 'foo',
          second: {},
        },
      }
      const expectedResult = {
        toplevel: {
          first: 'foo',
          second: {
            third: ['bar'],
          },
        },
      }
      await addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'bar',
        expectedResult,
      )
    })

    it('should add an item in the middle branch', async () => {
      const yamlContent = {
        initiallevel: 'bar',
        toplevel: {
          first: 'foo',
        },
        bottomlevel: 'bar',
      }
      const expectedResult = {
        initiallevel: 'bar',
        toplevel: {
          first: 'foo',
          second: ['bar'],
        },
        bottomlevel: 'bar',
      }
      await addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second',
        'bar',
        expectedResult,
      )
    })

    it('should add an item with multiple top level entries', async () => {
      const yamlContent = {
        toplevel: {
          first: 'foo',
          second: {},
        },
        nexttoplevel: {
          first: 'bar',
        },
      }
      const expectedResult = {
        toplevel: {
          first: 'foo',
          second: {
            third: ['bar'],
          },
        },
        nexttoplevel: {
          first: 'bar',
        },
      }
      await addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'bar',
        expectedResult,
      )
    })

    it('should do nothing when adding the existing item', async () => {
      const yamlContent = { toplevel: ['foo'] }
      const expectedResult = { toplevel: ['foo'] }
      await addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel',
        'foo',
        expectedResult,
      )
    })

    it('should survive with invalid yaml', async () => {
      const yamlContent = 'service:'
      const expectedResult = { service: null, toplevel: ['foo'] }
      await addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel',
        'foo',
        expectedResult,
      )
    })
  })

  describe('removeExistingArrayItem', () => {
    const removeExistingArrayItemAndVerifyResult = async (
      yamlContent,
      pathInYaml,
      removeItem,
      expectedResult,
    ) => {
      const yamlFilePath = path.join(tmpDir, 'test.yaml')
      await writeFile(yamlFilePath, yamlContent)
      await yamlAstParser.removeExistingArrayItem(
        yamlFilePath,
        pathInYaml,
        removeItem,
      )

      const yaml = await fs.readFile(yamlFilePath, 'utf8')
      const { load } = await import('js-yaml')
      const parsed = load(yaml)
      expect(parsed).toEqual(expectedResult)
    }

    it('should remove the existing top level object and item from the yaml file', async () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: ['foo'],
      }
      const expectedResult = { service: 'test-service' }
      await removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel',
        'foo',
        expectedResult,
      )
    })

    it('should remove the existing item under the object which you specify', async () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: ['foo', 'bar'],
      }
      const expectedResult = {
        service: 'test-service',
        toplevel: ['foo'],
      }
      await removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel',
        'bar',
        expectedResult,
      )
    })

    it('should remove the multiple level object and item from the yaml file', async () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
      }
      const expectedResult = { service: 'test-service' }
      await removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'foo',
        expectedResult,
      )
    })

    it('should remove the existing item under the multiple level object which you specify', async () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['foo', 'bar'],
          },
        },
      }
      const expectedResult = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
      }
      await removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'bar',
        expectedResult,
      )
    })

    it('should remove multilevel object from the middle branch', async () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
        end: 'end',
      }
      const expectedResult = {
        service: 'test-service',
        end: 'end',
      }
      await removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'foo',
        expectedResult,
      )
    })

    it('should remove item from multilevel object from the middle branch', async () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['foo', 'bar'],
          },
        },
        end: 'end',
      }
      const expectedResult = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['bar'],
          },
        },
        end: 'end',
      }
      await removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'foo',
        expectedResult,
      )
    })

    it('should do nothing when you can not find the object which you specify', async () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: ['foo', 'bar'],
      }
      await removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel',
        'foo2',
        yamlContent,
      )
    })

    it('should remove when with inline declaration of the array', async () => {
      const yamlContent = 'toplevel:\n  second: ["foo2", "bar"]'
      const expectedResult = {
        toplevel: {
          second: ['foo2'],
        },
      }
      await removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second',
        'bar',
        expectedResult,
      )
    })
  })
})
