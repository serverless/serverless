import { validateConfig } from '../../../../../../../lib/plugins/aws/appsync/validation.js'
import { basicConfig } from '../basicConfig.js'

describe('Basic', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          resolvers: {
            'Query.getUser': {
              kind: 'UNIT',
              dataSource: 'myDs',
            },
            'Query.getPost': {
              kind: 'PIPELINE',
              functions: [
                'function1',
                {
                  dataSource: 'function2',
                  code: 'function2.js',
                },
              ],
            },
            'Query.getBlog': {
              kind: 'UNIT',
              dataSource: 'myDs',
            },
            getUsers: {
              type: 'Query',
              field: 'getUsers',
              kind: 'UNIT',
              dataSource: 'myDs',
              sync: {
                conflictDetection: 'VERSION',
                conflictHandler: 'LAMBDA',
                function: { handler: 'index.handler' },
              },
              maxBatchSize: 200,
            },
            getPosts: {
              type: 'Query',
              field: 'getPosts',
              functions: [
                'function1',
                {
                  dataSource: {
                    type: 'AWS_LAMBDA',
                    config: {
                      functionName: 'function3',
                    },
                  },
                  code: 'function2.js',
                },
              ],
            },
            getBlogs: {
              kind: 'UNIT',
              type: 'Query',
              field: 'getUsers',
              dataSource: 'myDs',
            },
            getComments: {
              kind: 'UNIT',
              type: 'Query',
              field: 'getComments',
              dataSource: {
                type: 'AWS_LAMBDA',
                name: 'getComments',
                config: {
                  functionName: 'getComments',
                },
              },
            },
          },
        },
      },
      {
        name: 'Valid config, as array of maps',
        config: {
          resolvers: [
            {
              'Query.getUser': {
                kind: 'UNIT',
                dataSource: 'myDs',
              },
              'Query.getPost': {
                kind: 'PIPELINE',
                functions: ['function1', 'function2'],
              },
              'Query.getBlog': {
                kind: 'UNIT',
                dataSource: 'myDs',
              },
            },
            {
              getUsers: {
                type: 'Query',
                field: 'getUsers',
                kind: 'UNIT',
                dataSource: 'myDs',
                sync: {
                  conflictDetection: 'VERSION',
                  conflictHandler: 'OPTIMISTIC_CONCURRENCY',
                },
              },
              getPosts: {
                type: 'Query',
                field: 'getPosts',
                kind: 'PIPELINE',
                functions: ['function1', 'function2'],
              },
              'Query.getComment': {
                kind: 'UNIT',
                dataSource: {
                  type: 'AWS_LAMBDA',
                  name: 'getComment',
                  config: {
                    functionName: 'getComment',
                  },
                },
              },
            },
          ],
        },
      },
    ]

    assertions.forEach((config) => {
      it(`should validate a ${config.name}`, () => {
        expect(validateConfig({ ...basicConfig, ...config.config })).toBe(true)
      })
    })
  })

  describe('Invalid', () => {
    const assertions = [
      {
        name: 'Invalid',
        config: {
          resolvers: {
            myResolver: {
              kind: 'FOO',
              functions: 999,
              type: 123,
              field: 456,
              request: 123,
              response: 456,
              maxBatchSize: 5000,
            },
          },
        },
      },
      {
        name: 'Missing datasource',
        config: {
          resolvers: {
            'Query.user': {
              kind: 'UNIT',
            },
          },
        },
      },
      {
        name: 'Missing functions',
        config: {
          resolvers: {
            'Query.user': {
              kind: 'PIPELINE',
            },
          },
        },
      },
      {
        name: 'Missing type and field',
        config: {
          resolvers: {
            myResolver: {
              kind: 'UNIT',
              dataSource: 'myDs',
            },
          },
        },
      },
      {
        name: 'Missing type and field inline',
        config: {
          resolvers: {
            myResolver: 'dataSource',
          },
        },
      },
      {
        name: 'Invalid datasource',
        config: {
          resolvers: {
            'Query.getUser': 'foo',
          },
        },
      },
      {
        name: 'Invalid embedded datasource',
        config: {
          resolvers: {
            'Query.getUser': {
              kind: 'UNIT',
              dataSource: {
                type: 'AWS_LAMBDA',
                config: {},
              },
            },
          },
        },
      },
    ]

    assertions.forEach((config) => {
      it(`should validate: ${config.name}`, () => {
        expect(function () {
          validateConfig({
            ...basicConfig,
            ...config.config,
          })
        }).toThrowErrorMatchingSnapshot()
      })
    })
  })

  describe('S3 Location', () => {
    it('should accept a valid requestS3Location on a resolver', () => {
      expect(
        validateConfig({
          ...basicConfig,
          resolvers: {
            'Query.user': {
              kind: 'UNIT',
              dataSource: 'myDs',
              requestS3Location: { bucket: 'my-bucket', key: 'request.vtl' },
            },
          },
        }),
      ).toBe(true)
    })

    it('should accept a valid responseS3Location', () => {
      expect(
        validateConfig({
          ...basicConfig,
          resolvers: {
            'Query.user': {
              kind: 'UNIT',
              dataSource: 'myDs',
              responseS3Location: {
                bucket: 'my-bucket',
                key: 'response.vtl',
              },
            },
          },
        }),
      ).toBe(true)
    })

    it('should throw when request and requestS3Location are both set', () => {
      expect(() => {
        validateConfig({
          ...basicConfig,
          resolvers: {
            'Query.user': {
              kind: 'UNIT',
              dataSource: 'myDs',
              request: 'request.vtl',
              requestS3Location: { bucket: 'my-bucket', key: 'request.vtl' },
            },
          },
        })
      }).toThrow('mutually exclusive')
    })

    it('should throw when response and responseS3Location are both set', () => {
      expect(() => {
        validateConfig({
          ...basicConfig,
          resolvers: {
            'Query.user': {
              kind: 'UNIT',
              dataSource: 'myDs',
              response: 'response.vtl',
              responseS3Location: { bucket: 'my-bucket', key: 'response.vtl' },
            },
          },
        })
      }).toThrow('mutually exclusive')
    })

    it('should throw when code and requestS3Location are combined', () => {
      expect(() => {
        validateConfig({
          ...basicConfig,
          resolvers: {
            'Query.user': {
              kind: 'UNIT',
              dataSource: 'myDs',
              code: 'resolver.js',
              requestS3Location: { bucket: 'my-bucket', key: 'request.vtl' },
            },
          },
        })
      }).toThrow(
        "'code' (JS) cannot be combined with an S3 mapping-template location",
      )
    })

    it('should throw when requestS3Location is missing key', () => {
      expect(() => {
        validateConfig({
          ...basicConfig,
          resolvers: {
            'Query.user': {
              kind: 'UNIT',
              dataSource: 'myDs',
              requestS3Location: { bucket: 'my-bucket' },
            },
          },
        })
      }).toThrow()
    })

    it('should throw when requestS3Location has unknown property', () => {
      expect(() => {
        validateConfig({
          ...basicConfig,
          resolvers: {
            'Query.user': {
              kind: 'UNIT',
              dataSource: 'myDs',
              requestS3Location: {
                bucket: 'my-bucket',
                key: 'request.vtl',
                bucketName: 'typo',
              },
            },
          },
        })
      }).toThrow()
    })
  })
})
