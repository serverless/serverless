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
})
