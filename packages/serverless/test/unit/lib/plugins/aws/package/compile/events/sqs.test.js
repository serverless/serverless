import { jest } from '@jest/globals'

// Mock Utils
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {},
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { default: AwsProvider } =
  await import('../../../../../../../../lib/plugins/aws/provider.js')
const { default: AwsCompileSQSEvents } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/sqs.js')
const { default: Serverless } =
  await import('../../../../../../../../lib/serverless.js')

describe('AwsCompileSQSEvents', () => {
  let serverless
  let awsCompileSQSEvents

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.cli = { log: jest.fn() }
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    const options = { region: 'us-east-1' }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
      {
        Properties: {
          Policies: [
            {
              PolicyDocument: {
                Statement: [],
              },
            },
          ],
        },
      }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileSQSEvents = new AwsCompileSQSEvents(serverless, options)
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileSQSEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileSQSEvents()', () => {
    it('should create event source mapping resource when sqs event is given as string ARN', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:MyQueue',
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Find the EventSourceMapping resource
      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      const [logicalId, resource] = eventSourceMappings[0]
      expect(resource.Type).toBe('AWS::Lambda::EventSourceMapping')
      expect(resource.Properties.EventSourceArn).toBe(
        'arn:aws:sqs:region:account:MyQueue',
      )
      expect(resource.Properties.BatchSize).toBe(10) // default
      expect(resource.Properties.Enabled).toBe(true) // default
    })

    it('should create event source mapping with custom batchSize', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: {
                arn: 'arn:aws:sqs:region:account:MyQueue',
                batchSize: 5,
              },
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(eventSourceMappings[0][1].Properties.BatchSize).toBe(5)
    })

    it('should create event source mapping with enabled set to false', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: {
                arn: 'arn:aws:sqs:region:account:MyQueue',
                enabled: false,
              },
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(eventSourceMappings[0][1].Properties.Enabled).toBe(false)
    })

    it('should create event source mapping with maximumBatchingWindow', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: {
                arn: 'arn:aws:sqs:region:account:MyQueue',
                maximumBatchingWindow: 100,
              },
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(
        eventSourceMappings[0][1].Properties.MaximumBatchingWindowInSeconds,
      ).toBe(100)
    })

    it('should create event source mapping with functionResponseType', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: {
                arn: 'arn:aws:sqs:region:account:MyQueue',
                functionResponseType: 'ReportBatchItemFailures',
              },
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(
        eventSourceMappings[0][1].Properties.FunctionResponseTypes,
      ).toEqual(['ReportBatchItemFailures'])
    })

    it('should support Fn::GetAtt for arn', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: {
                arn: { 'Fn::GetAtt': ['SomeQueue', 'Arn'] },
              },
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(eventSourceMappings[0][1].Properties.EventSourceArn).toEqual({
        'Fn::GetAtt': ['SomeQueue', 'Arn'],
      })
    })

    it('should support Fn::ImportValue for arn', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: {
                arn: { 'Fn::ImportValue': 'ForeignQueue' },
              },
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(eventSourceMappings[0][1].Properties.EventSourceArn).toEqual({
        'Fn::ImportValue': 'ForeignQueue',
      })
    })

    it('should support Fn::Join for arn', () => {
      const arnWithJoin = {
        'Fn::Join': [
          ':',
          [
            'arn',
            'aws',
            'sqs',
            { Ref: 'AWS::Region' },
            { Ref: 'AWS::AccountId' },
            'MyQueue',
          ],
        ],
      }

      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: {
                arn: arnWithJoin,
              },
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(eventSourceMappings[0][1].Properties.EventSourceArn).toEqual(
        arnWithJoin,
      )
    })

    it('should add SQS permissions to IAM role', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:MyQueue',
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const iamRole = resources.IamRoleLambdaExecution
      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement

      const sqsStatement = statements.find(
        (s) => s.Action && s.Action.includes('sqs:ReceiveMessage'),
      )

      expect(sqsStatement).toBeDefined()
      expect(sqsStatement.Action).toContain('sqs:ReceiveMessage')
      expect(sqsStatement.Action).toContain('sqs:DeleteMessage')
      expect(sqsStatement.Action).toContain('sqs:GetQueueAttributes')
    })

    it('should create event source mappings for multiple functions', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:Queue1',
            },
          ],
        },
        second: {
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:Queue2',
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(2)
    })

    it('should support filterPatterns', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: {
                arn: 'arn:aws:sqs:region:account:MyQueue',
                filterPatterns: [{ body: { type: ['order'] } }],
              },
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(eventSourceMappings[0][1].Properties.FilterCriteria).toBeDefined()
    })

    it('should support maximumConcurrency', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: {
                arn: 'arn:aws:sqs:region:account:MyQueue',
                maximumConcurrency: 5,
              },
            },
          ],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(eventSourceMappings[0][1].Properties.ScalingConfig).toEqual({
        MaximumConcurrency: 5,
      })
    })

    it('should not create resources when no SQS events are given', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      }

      awsCompileSQSEvents.compileSQSEvents()

      const resources =
        awsCompileSQSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(0)
    })

    it('should not throw error when other events are present', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'get',
                path: '/',
              },
            },
          ],
        },
      }

      expect(() => awsCompileSQSEvents.compileSQSEvents()).not.toThrow()
    })

    describe('provisioned mode', () => {
      it('should create event source mapping with provisioned mode PROVISIONED', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyQueue',
                  provisioned: {
                    mode: 'PROVISIONED',
                    minimumPollers: 10,
                    maximumPollers: 100,
                  },
                },
              },
            ],
          },
        }

        awsCompileSQSEvents.compileSQSEvents()

        const resources =
          awsCompileSQSEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources

        const eventSourceMappings = Object.entries(resources).filter(
          ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
        )

        expect(eventSourceMappings.length).toBe(1)
        expect(
          eventSourceMappings[0][1].Properties.ProvisionedPollerConfig,
        ).toEqual({
          Mode: 'PROVISIONED',
          MinimumPollers: 10,
          MaximumPollers: 100,
        })
      })

      it('should create event source mapping with provisioned mode ON_DEMAND', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyQueue',
                  provisioned: {
                    mode: 'ON_DEMAND',
                  },
                },
              },
            ],
          },
        }

        awsCompileSQSEvents.compileSQSEvents()

        const resources =
          awsCompileSQSEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources

        const eventSourceMappings = Object.entries(resources).filter(
          ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
        )

        expect(eventSourceMappings.length).toBe(1)
        expect(
          eventSourceMappings[0][1].Properties.ProvisionedPollerConfig,
        ).toEqual({
          Mode: 'ON_DEMAND',
        })
      })

      it('should create event source mapping with only maximumPollers', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyQueue',
                  provisioned: {
                    maximumPollers: 50,
                  },
                },
              },
            ],
          },
        }

        awsCompileSQSEvents.compileSQSEvents()

        const resources =
          awsCompileSQSEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources

        const eventSourceMappings = Object.entries(resources).filter(
          ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
        )

        expect(eventSourceMappings.length).toBe(1)
        expect(
          eventSourceMappings[0][1].Properties.ProvisionedPollerConfig,
        ).toEqual({
          MaximumPollers: 50,
        })
      })

      it('should create event source mapping with provisioned mode and other settings', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyQueue',
                  batchSize: 25,
                  maximumBatchingWindow: 60,
                  provisioned: {
                    mode: 'PROVISIONED',
                    minimumPollers: 5,
                    maximumPollers: 50,
                  },
                },
              },
            ],
          },
        }

        awsCompileSQSEvents.compileSQSEvents()

        const resources =
          awsCompileSQSEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources

        const eventSourceMappings = Object.entries(resources).filter(
          ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
        )

        expect(eventSourceMappings.length).toBe(1)
        expect(eventSourceMappings[0][1].Properties.BatchSize).toBe(25)
        expect(
          eventSourceMappings[0][1].Properties.MaximumBatchingWindowInSeconds,
        ).toBe(60)
        expect(
          eventSourceMappings[0][1].Properties.ProvisionedPollerConfig,
        ).toEqual({
          Mode: 'PROVISIONED',
          MinimumPollers: 5,
          MaximumPollers: 50,
        })
      })

      it('should throw error when minimumPollers is set with ON_DEMAND mode', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyQueue',
                  provisioned: {
                    mode: 'ON_DEMAND',
                    minimumPollers: 10,
                  },
                },
              },
            ],
          },
        }

        expect(() => awsCompileSQSEvents.compileSQSEvents()).toThrow(
          /minimumPollers can only be set when mode is PROVISIONED/,
        )
      })

      it('should throw error when minimumPollers is greater than maximumPollers', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyQueue',
                  provisioned: {
                    mode: 'PROVISIONED',
                    minimumPollers: 100,
                    maximumPollers: 50,
                  },
                },
              },
            ],
          },
        }

        expect(() => awsCompileSQSEvents.compileSQSEvents()).toThrow(
          /minimumPollers \(100\) cannot be greater than maximumPollers \(50\)/,
        )
      })

      it('should allow provisioned mode with Fn::GetAtt for arn', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: { 'Fn::GetAtt': ['SomeQueue', 'Arn'] },
                  provisioned: {
                    mode: 'PROVISIONED',
                    minimumPollers: 10,
                    maximumPollers: 100,
                  },
                },
              },
            ],
          },
        }

        awsCompileSQSEvents.compileSQSEvents()

        const resources =
          awsCompileSQSEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources

        const eventSourceMappings = Object.entries(resources).filter(
          ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
        )

        expect(eventSourceMappings.length).toBe(1)
        expect(eventSourceMappings[0][1].Properties.EventSourceArn).toEqual({
          'Fn::GetAtt': ['SomeQueue', 'Arn'],
        })
        expect(
          eventSourceMappings[0][1].Properties.ProvisionedPollerConfig,
        ).toEqual({
          Mode: 'PROVISIONED',
          MinimumPollers: 10,
          MaximumPollers: 100,
        })
      })

      it('should not add ProvisionedPollerConfig when provisioned is not specified', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyQueue',
                  batchSize: 10,
                },
              },
            ],
          },
        }

        awsCompileSQSEvents.compileSQSEvents()

        const resources =
          awsCompileSQSEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources

        const eventSourceMappings = Object.entries(resources).filter(
          ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
        )

        expect(eventSourceMappings.length).toBe(1)
        expect(
          eventSourceMappings[0][1].Properties.ProvisionedPollerConfig,
        ).toBeUndefined()
      })

      it('should allow minimumPollers without explicit mode (defaults to PROVISIONED behavior)', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyQueue',
                  provisioned: {
                    minimumPollers: 10,
                    maximumPollers: 100,
                  },
                },
              },
            ],
          },
        }

        awsCompileSQSEvents.compileSQSEvents()

        const resources =
          awsCompileSQSEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources

        const eventSourceMappings = Object.entries(resources).filter(
          ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
        )

        expect(eventSourceMappings.length).toBe(1)
        expect(
          eventSourceMappings[0][1].Properties.ProvisionedPollerConfig,
        ).toEqual({
          MinimumPollers: 10,
          MaximumPollers: 100,
        })
      })

      it('should work with filterPatterns and provisioned mode', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyQueue',
                  filterPatterns: [{ body: { type: ['order'] } }],
                  provisioned: {
                    mode: 'PROVISIONED',
                    maximumPollers: 200,
                  },
                },
              },
            ],
          },
        }

        awsCompileSQSEvents.compileSQSEvents()

        const resources =
          awsCompileSQSEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources

        const eventSourceMappings = Object.entries(resources).filter(
          ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
        )

        expect(eventSourceMappings.length).toBe(1)
        expect(
          eventSourceMappings[0][1].Properties.FilterCriteria,
        ).toBeDefined()
        expect(
          eventSourceMappings[0][1].Properties.ProvisionedPollerConfig,
        ).toEqual({
          Mode: 'PROVISIONED',
          MaximumPollers: 200,
        })
      })
    })
  })
})
