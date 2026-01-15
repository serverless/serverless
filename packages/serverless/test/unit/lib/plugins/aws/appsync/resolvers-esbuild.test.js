/**
 * Tests for JS resolver code bundling with esbuild
 *
 * These tests use jest.unstable_mockModule to mock the esbuild ESM module
 * before importing the Api class. This pattern is required for ESM modules
 * and matches the approach used in sf-core and mcp packages.
 */

import { jest } from '@jest/globals'
import fs from 'fs'

// Mock esbuild BEFORE importing Api
const mockBuildSync = jest.fn()

jest.unstable_mockModule('esbuild', () => ({
  buildSync: mockBuildSync,
}))

// Import given.js before Api to set up plugin
const givenModule = await import('./given.js')
const given = givenModule

// Import Api AFTER esbuild mock is set up
const { Api } =
  await import('../../../../../../lib/plugins/aws/appsync/resources/Api.js')

const plugin = given.plugin()

describe('Resolvers with esbuild', () => {
  let mockReadFile
  let mockExists

  beforeEach(() => {
    mockReadFile = jest
      .spyOn(fs, 'readFileSync')
      .mockImplementation((filePath) => {
        const relativePath = `${filePath}`
          .replace(/\\/g, '/')
          .replace(process.cwd().replace(/\\/g, '/') + '/', '')
        return `Content of ${relativePath}`
      })
    mockExists = jest.spyOn(fs, 'existsSync').mockReturnValue(true)

    // Configure esbuild mock to return bundled content
    mockBuildSync.mockImplementation((config) => ({
      errors: [],
      warnings: [],
      metafile: undefined,
      mangleCache: undefined,
      outputFiles: [
        {
          path: 'path/to/file',
          contents: Uint8Array.from([]),
          text: `Bundled content of ${`${config.entryPoints?.[0]}`.replace(
            /\\/g,
            '/',
          )}`,
        },
      ],
    }))
  })

  afterEach(() => {
    mockReadFile.mockRestore()
    mockExists.mockRestore()
    mockBuildSync.mockClear()
  })

  describe('Unit Resolvers', () => {
    it('should generate JS Resources with specific code', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {
            myTable: {
              name: 'myTable',
              type: 'AMAZON_DYNAMODB',
              config: { tableName: 'data' },
            },
          },
        }),
        plugin,
      )
      expect(
        api.compileResolver({
          type: 'Query',
          kind: 'UNIT',
          field: 'user',
          dataSource: 'myTable',
          code: 'resolvers/getUserFunction.js',
        }),
      ).toMatchSnapshot()
    })
  })

  describe('Pipeline Resolvers', () => {
    it('should generate JS Resources with specific code', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {
            myTable: {
              name: 'myTable',
              type: 'AMAZON_DYNAMODB',
              config: { tableName: 'data' },
            },
          },
          pipelineFunctions: {
            getUser: {
              name: 'getUser',
              dataSource: 'myTable',
            },
          },
        }),
        plugin,
      )
      expect(
        api.compileResolver({
          type: 'Query',
          field: 'user',
          functions: ['getUser'],
          code: 'resolvers/getUserFunction.js',
        }),
      ).toMatchSnapshot()
    })
  })

  describe('Pipeline Function', () => {
    it('should generate Pipeline Function Resources with JS code', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {
            myTable: {
              name: 'myTable',
              type: 'AMAZON_DYNAMODB',
              config: { tableName: 'data' },
            },
          },
        }),
        plugin,
      )
      expect(
        api.compilePipelineFunctionResource({
          name: 'function1',
          dataSource: 'myTable',
          description: 'Function1 Pipeline Resolver',
          code: 'funciton1.js',
        }),
      ).toMatchSnapshot()
    })
  })
})
