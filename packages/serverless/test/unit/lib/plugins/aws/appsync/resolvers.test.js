import { jest } from '@jest/globals'
import fs from 'fs'
import { Api } from '../../../../../../lib/plugins/aws/appsync/resources/Api.js'
import * as given from './given.js'

const plugin = given.plugin()

describe('Resolvers', () => {
  let mock
  let mockExists

  beforeEach(() => {
    mock = jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
      // Strip cwd prefix for portable snapshot testing
      const relativePath = `${filePath}`
        .replace(/\\/g, '/')
        .replace(process.cwd().replace(/\\/g, '/') + '/', '')
      return `Content of ${relativePath}`
    })
    mockExists = jest.spyOn(fs, 'existsSync').mockReturnValue(true)
  })

  afterEach(() => {
    mock.mockRestore()
    mockExists.mockRestore()
  })

  // Note: esbuild tests skipped - ESM modules can't be mocked with jest.spyOn

  describe('Unit Resolvers', () => {
    it('should generate Resources with VTL mapping templates', () => {
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
          dataSource: 'myTable',
          kind: 'UNIT',
          type: 'Query',
          field: 'user',
          request: 'path/to/mappingTemplates/Query.user.request.vtl',
          response: 'path/to/mappingTemplates/Query.user.response.vtl',
        }),
      ).toMatchSnapshot()
    })

    // Skipped: requires esbuild mock (ESM can't mock esbuild module)
    it.skip('should generate JS Resources with specific code', () => {
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

    it('should generate Resources with direct Lambda', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {
            myLambdaFunction: {
              name: 'myLambdaFunction',
              type: 'AWS_LAMBDA',
              config: { functionArn: 'arn:lambda:' },
            },
          },
        }),
        plugin,
      )
      expect(
        api.compileResolver({
          dataSource: 'myLambdaFunction',
          kind: 'UNIT',
          type: 'Query',
          field: 'user',
        }),
      ).toMatchSnapshot()
    })

    it('should generate Resources with maxBatchSize', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {
            myFunction: {
              name: 'myFunction',
              type: 'AWS_LAMBDA',
              config: { functionName: 'myFunction' },
            },
          },
        }),
        plugin,
      )
      expect(
        api.compileResolver({
          dataSource: 'myFunction',
          kind: 'UNIT',
          type: 'Query',
          field: 'user',
          maxBatchSize: 200,
        }),
      ).toMatchSnapshot()
    })

    it('should generate Resources with sync configuration', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {
            myLambdaFunction: {
              name: 'myLambdaFunction',
              type: 'AWS_LAMBDA',
              config: { functionArn: 'arn:lambda:' },
            },
          },
        }),
        plugin,
      )
      expect(
        api.compileResolver({
          dataSource: 'myLambdaFunction',
          kind: 'UNIT',
          type: 'Query',
          field: 'user',
          sync: {
            conflictDetection: 'VERSION',
            conflictHandler: 'LAMBDA',
            function: {
              handler: 'index.handler',
            },
          },
        }),
      ).toMatchSnapshot()
      expect(api.functions).toMatchSnapshot()
    })

    it('should fail when referencing unknown data source', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {},
        }),
        plugin,
      )
      expect(function () {
        api.compileResolver({
          dataSource: 'myLambdaFunction',
          kind: 'UNIT',
          type: 'Query',
          field: 'user',
        })
      }).toThrowErrorMatchingSnapshot()
    })
  })

  describe('Pipeline Resolvers', () => {
    it('should generate JS Resources with default empty resolver', () => {
      mockExists.mockReturnValue(false)
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
        }),
      ).toMatchSnapshot()
    })

    it('should generate Resources with VTL mapping templates', () => {
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
            function1: {
              name: 'function1',
              dataSource: 'myTable',
            },
            function2: {
              name: 'function2',
              dataSource: 'myTable',
            },
          },
        }),
        plugin,
      )
      expect(
        api.compileResolver({
          kind: 'PIPELINE',
          type: 'Query',
          field: 'user',
          request: 'Query.user.request.vtl',
          response: 'Query.user.response.vtl',
          functions: ['function1', 'function2'],
        }),
      ).toMatchSnapshot()
    })

    // Skipped: requires esbuild mock
    it.skip('should generate JS Resources with specific code', () => {
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

    it('should fail when referencing unknown pipeline function', () => {
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
            function1: {
              name: 'function1',
              dataSource: 'myTable',
            },
          },
        }),
        plugin,
      )
      expect(function () {
        api.compileResolver({
          kind: 'PIPELINE',
          type: 'Query',
          field: 'user',
          functions: ['function1', 'function2'],
        })
      }).toThrowErrorMatchingSnapshot()
    })
  })

  describe('Pipeline Function', () => {
    // Skipped: requires esbuild mock
    it.skip('should generate Pipeline Function Resources with JS code', () => {
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

    it('should generate Pipeline Function Resources with VTL mapping templates', () => {
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
          request: 'path/to/mappingTemplates/function1.request.vtl',
          response: 'path/to/mappingTemplates/function1.response.vtl',
        }),
      ).toMatchSnapshot()
    })

    it('should generate Pipeline Function Resources with direct Lambda', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {
            myLambdaFunction: {
              name: 'myLambdaFunction',
              type: 'AWS_LAMBDA',
              config: { functionArn: 'arn:lambda:' },
            },
          },
        }),
        plugin,
      )
      expect(
        api.compilePipelineFunctionResource({
          name: 'function1',
          dataSource: 'myLambdaFunction',
          description: 'Function1 Pipeline Resolver',
        }),
      ).toMatchSnapshot()
    })

    it('should generate Resources with sync configuration', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {
            myLambdaFunction: {
              name: 'myLambdaFunction',
              type: 'AWS_LAMBDA',
              config: { functionArn: 'arn:lambda:' },
            },
          },
        }),
        plugin,
      )
      expect(
        api.compilePipelineFunctionResource({
          dataSource: 'myLambdaFunction',
          name: 'myFunction',
          request: 'myFunction.request.vtl',
          response: 'myFunction.response.vtl',
          sync: {
            conflictDetection: 'VERSION',
            conflictHandler: 'LAMBDA',
            function: {
              handler: 'index.handler',
            },
          },
        }),
      ).toMatchSnapshot()
    })

    it('should generate Pipeline Function Resources with maxBatchSize', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {
            myFunction: {
              name: 'myFunction',
              type: 'AWS_LAMBDA',
              config: { functionName: 'myFunction' },
            },
          },
        }),
        plugin,
      )
      expect(
        api.compilePipelineFunctionResource({
          name: 'function1',
          dataSource: 'myFunction',
          request: 'function1.request.vtl',
          response: 'function1.response.vtl',
          description: 'Function1 Pipeline Resolver',
          maxBatchSize: 200,
        }),
      ).toMatchSnapshot()
    })

    it('should fail if Pipeline Function references unexisting data source', () => {
      const api = new Api(
        given.appSyncConfig({
          dataSources: {},
        }),
        plugin,
      )
      expect(function () {
        api.compilePipelineFunctionResource({
          name: 'function1',
          dataSource: 'myLambdaFunction',
          description: 'Function1 Pipeline Resolver',
        })
      }).toThrowErrorMatchingSnapshot()
    })
  })

  describe('Caching', () => {
    it('should generate Resources with caching enabled', () => {
      const api = new Api(
        given.appSyncConfig({
          caching: {
            behavior: 'PER_RESOLVER_CACHING',
          },
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
          dataSource: 'myTable',
          kind: 'UNIT',
          type: 'Query',
          field: 'user',
          caching: true,
        }),
      ).toMatchSnapshot()
    })

    it('should generate Resources with custom keys', () => {
      const api = new Api(
        given.appSyncConfig({
          caching: {
            behavior: 'PER_RESOLVER_CACHING',
          },
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
          dataSource: 'myTable',
          kind: 'UNIT',
          type: 'Query',
          field: 'user',
          caching: {
            ttl: 200,
            keys: ['$context.identity.sub', '$context.arguments.id'],
          },
        }),
      ).toMatchSnapshot()
    })

    it('should fallback to global caching TTL', () => {
      const api = new Api(
        given.appSyncConfig({
          caching: {
            behavior: 'PER_RESOLVER_CACHING',
            ttl: 300,
          },
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
          dataSource: 'myTable',
          kind: 'UNIT',
          type: 'Query',
          field: 'user',
          caching: {
            keys: ['$context.identity.sub', '$context.arguments.id'],
          },
        }),
      ).toMatchSnapshot()
    })
  })
})
