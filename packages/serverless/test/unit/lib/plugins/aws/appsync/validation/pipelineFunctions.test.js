import { validateConfig } from '../../../../../../../lib/plugins/aws/appsync/validation.js'
import { basicConfig } from '../basicConfig.js'

describe('Basic', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          pipelineFunctions: {
            function1: {
              dataSource: 'ds1',
            },
            function2: {
              description: 'My Function',
              dataSource: 'ds1',
              maxBatchSize: 200,
              request: 'request.vtl',
              response: 'response.vtl',
            },
          },
        },
      },
      {
        name: 'Valid config, as array of maps',
        config: {
          pipelineFunctions: [
            {
              function1: {
                dataSource: 'ds1',
              },
              function3: {
                dataSource: {
                  type: 'AWS_LAMBDA',
                  config: {
                    function: {
                      handler: 'index.handler',
                    },
                  },
                },
              },
            },
            {
              function2: {
                name: 'myFunction1',
                description: 'My Function',
                dataSource: 'ds1',
                request: 'request.vtl',
                response: 'response.vtl',
              },
              function4: 'ds1',
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
          pipelineFunctions: {
            function1: {
              description: 456,
              dataSource: 789,
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
          pipelineFunctions: {
            function1: {
              datasource: {
                type: 'AWS_LAMBDA',
                config: {
                  handler: 'index.handler',
                },
              },
            },
          },
        },
      },
      {
        name: 'Invalid inline datasource',
        config: {
          pipelineFunctions: {
            function1: 123,
          },
        },
      },
      {
        name: 'Invalid embedded datasource',
        config: {
          pipelineFunctions: {
            function1: {
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
    it('should accept a valid requestS3Location on a pipeline function', () => {
      expect(
        validateConfig({
          ...basicConfig,
          pipelineFunctions: {
            function1: {
              dataSource: 'ds1',
              requestS3Location: { bucket: 'my-bucket', key: 'request.vtl' },
              responseS3Location: { bucket: 'my-bucket', key: 'response.vtl' },
            },
          },
        }),
      ).toBe(true)
    })

    it('should throw when request and requestS3Location are both set on a pipeline function', () => {
      expect(() => {
        validateConfig({
          ...basicConfig,
          pipelineFunctions: {
            function1: {
              dataSource: 'ds1',
              request: 'request.vtl',
              requestS3Location: { bucket: 'my-bucket', key: 'request.vtl' },
            },
          },
        })
      }).toThrow('mutually exclusive')
    })

    it('should throw when code and responseS3Location are combined on a pipeline function', () => {
      expect(() => {
        validateConfig({
          ...basicConfig,
          pipelineFunctions: {
            function1: {
              dataSource: 'ds1',
              code: 'function.js',
              responseS3Location: { bucket: 'my-bucket', key: 'response.vtl' },
            },
          },
        })
      }).toThrow(
        "'code' (JS) cannot be combined with an S3 mapping-template location",
      )
    })

    it('should throw when requestS3Location is missing key on a pipeline function', () => {
      expect(() => {
        validateConfig({
          ...basicConfig,
          pipelineFunctions: {
            function1: {
              dataSource: 'ds1',
              requestS3Location: { bucket: 'my-bucket' },
            },
          },
        })
      }).toThrow()
    })
  })
})
