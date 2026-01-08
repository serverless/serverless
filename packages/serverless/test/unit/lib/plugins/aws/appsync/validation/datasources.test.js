import { validateConfig } from '../../../../../../../lib/plugins/aws/appsync/validation.js'
import { basicConfig } from '../basicConfig.js'

describe('Basic', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          dataSources: {
            myDynamoSource1: {
              type: 'AMAZON_DYNAMODB',
              description: 'My Dynamo Datasource',
              config: {
                tableName: 'myTable',
              },
            },
          },
        },
      },
      {
        name: 'Valid config, as array of maps',
        config: {
          dataSources: [
            {
              myDynamoSource1: {
                type: 'AMAZON_DYNAMODB',
                description: 'My Dynamo Datasource',
                config: {
                  tableName: 'myTable',
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
        name: 'Invalid Datasource',
        config: {
          dataSources: {
            myDynamoSource1: {
              type: 'Foo',
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

describe('DynamoDB', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          dataSources: {
            myDynamoSource1: {
              type: 'AMAZON_DYNAMODB',
              config: {
                tableName: 'myTable',
              },
            },
            myDynamoSource2: {
              type: 'AMAZON_DYNAMODB',
              config: {
                tableName: { Ref: 'MyTable' },
                region: { 'Fn::Sub': '${AWS::Region}' },
                serviceRoleArn: { 'Fn::GetAtt': 'MyRole.Arn' },
              },
            },
            myDynamoSource3: {
              type: 'AMAZON_DYNAMODB',
              config: {
                tableName: 'myTable',
                useCallerCredentials: true,
                region: 'us-east-2',
                serviceRoleArn: 'arn:',
                iamRoleStatements: [
                  {
                    Effect: 'Allow',
                    Action: ['DynamoDB:PutItem'],
                    Resource: ['arn:dynamodb:'],
                  },
                ],
                versioned: true,
                deltaSyncConfig: {
                  deltaSyncTableName: 'deltaSyncTable',
                  baseTableTTL: 60,
                  deltaSyncTableTTL: 60,
                },
              },
            },
          },
        },
      },
      {
        name: 'Valid config, as array of maps',
        config: {
          dataSources: [
            {
              myDynamoSource1: {
                type: 'AMAZON_DYNAMODB',
                config: {
                  tableName: 'myTable',
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
        name: 'Missing config',
        config: {
          dataSources: {
            myDynamoSource1: {
              type: 'AMAZON_DYNAMODB',
            },
          },
        },
      },
      {
        name: 'Empty config',
        config: {
          dataSources: {
            myDynamoSource1: {
              type: 'AMAZON_DYNAMODB',
              config: {},
            },
          },
        },
      },
      {
        name: 'Invalid config',
        config: {
          dataSources: {
            myDynamoSource1: {
              type: 'AMAZON_DYNAMODB',
              config: {
                tableName: 123,
                useCallerCredentials: 'foo',
                region: 123,
                serviceRoleArn: 456,
                iamRoleStatements: [{}],
                versioned: 'bar',
                deltaSyncConfig: {
                  baseTableTTL: '123',
                  deltaSyncTableTTL: '456',
                },
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

describe('EventBridge', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          dataSources: {
            myDynamoSource1: {
              type: 'AMAZON_EVENTBRIDGE',
              config: {
                eventBusArn:
                  'arn:aws:events:us-east-1:123456789012:event-bus/my-event-bus',
              },
            },
          },
        },
      },
      {
        name: 'EventBusArn as Ref',
        config: {
          dataSources: {
            myDynamoSource1: {
              type: 'AMAZON_EVENTBRIDGE',
              config: {
                eventBusArn: {
                  'Fn::GetAtt': ['MyEventBus', 'Arn'],
                },
              },
            },
          },
        },
      },
      {
        name: 'Valid config, as array of maps',
        config: {
          dataSources: [
            {
              myDynamoSource1: {
                type: 'AMAZON_EVENTBRIDGE',
                config: {
                  eventBusArn:
                    'arn:aws:events:us-east-1:123456789012:event-bus/my-event-bus',
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
        name: 'Missing config',
        config: {
          dataSources: {
            myEventBridgeSource1: {
              type: 'AMAZON_EVENTBRIDGE',
            },
          },
        },
      },
      {
        name: 'Empty config',
        config: {
          dataSources: {
            myEventBridgeSource1: {
              type: 'AMAZON_EVENTBRIDGE',
              config: {},
            },
          },
        },
      },
      {
        name: 'Invalid config',
        config: {
          dataSources: {
            myEventBridgeSource1: {
              type: 'AMAZON_EVENTBRIDGE',
              config: {
                eventBusArn: 1234,
              },
            },
          },
        },
      },
    ]

    assertions.forEach((config) => {
      it(`should not validate: ${config.name}`, () => {
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

describe('Lambda', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          dataSources: {
            myLambda1: {
              type: 'AWS_LAMBDA',
              config: {
                functionName: 'myTable',
              },
            },
            myLambda2: {
              type: 'AWS_LAMBDA',
              config: {
                functionArn: 'arn:lambda',
                serviceRoleArn: 'arn:iam',
              },
            },
            myLambda3: {
              type: 'AWS_LAMBDA',
              config: {
                functionArn: { Ref: 'MyLambda' },
                serviceRoleArn: { Ref: 'MyRole' },
              },
            },
            myLambda4: {
              type: 'AWS_LAMBDA',
              config: {
                functionName: 'myLambda',
                iamRoleStatements: [
                  {
                    Effect: 'Allow',
                    Action: ['lambda:invokeFunction'],
                    Resource: ['arn:lambda:'],
                  },
                ],
              },
            },
            myLambda5: {
              type: 'AWS_LAMBDA',
              config: {
                function: {
                  handler: 'index.handler',
                  timeout: 30,
                },
              },
            },
          },
        },
      },
      {
        name: 'Valid config, as array of maps',
        config: {
          dataSources: [
            {
              myLambda1: {
                type: 'AWS_LAMBDA',
                config: {
                  functionName: 'myTable',
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
        name: 'Missing config',
        config: {
          dataSources: {
            myLambda1: {
              type: 'AWS_LAMBDA',
            },
          },
        },
      },
      {
        name: 'Empty config',
        config: {
          dataSources: {
            myLambda1: {
              type: 'AWS_LAMBDA',
              config: {},
            },
          },
        },
      },
      {
        name: 'Invalid config',
        config: {
          dataSources: {
            myLambda1: {
              type: 'AWS_LAMBDA',
              config: {
                tableName: 123,
              },
            },
          },
        },
      },
      {
        name: 'Invalid functionName',
        config: {
          dataSources: {
            myLambda1: {
              type: 'AWS_LAMBDA',
              config: {
                functionName: 123,
              },
            },
          },
        },
      },
      {
        name: 'Invalid functionArn',
        config: {
          dataSources: {
            myLambda1: {
              type: 'AWS_LAMBDA',
              config: {
                functionArn: 123,
              },
            },
          },
        },
      },
      {
        name: 'Invalid embedded function',
        config: {
          dataSources: {
            myLambda1: {
              type: 'AWS_LAMBDA',
              config: {
                function: 'myFunction',
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

describe('RelationalDb', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          dataSources: {
            rds1: {
              type: 'RELATIONAL_DATABASE',
              config: {
                dbClusterIdentifier: 'myClisterId',
                awsSecretStoreArn: 'aws:arn:',
              },
            },
            rds2: {
              type: 'RELATIONAL_DATABASE',
              config: {
                dbClusterIdentifier: 'myClisterId',
                relationalDatabaseSourceType: 'RDS_HTTP_ENDPOINT',
                region: 'us-east-1',
                dataBaseName: 'myDatabase',
                schema: '',
                awsSecretStoreArn: { Reg: 'MySecretStore' },
                iamRoleStatements: [
                  {
                    Effect: 'Allow',
                    Action: ['rds-data:GetItems'],
                    Resource: ['aws:arn:rds:'],
                  },
                ],
              },
            },
          },
        },
      },
      {
        name: 'Valid config, as array of maps',
        config: {
          dataSources: [
            {
              rds1: {
                type: 'RELATIONAL_DATABASE',
                config: {
                  dbClusterIdentifier: 'myClisterId',
                  awsSecretStoreArn: 'aws:arn:',
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
        name: 'Missing config',
        config: {
          dataSources: {
            http1: {
              type: 'HTTP',
            },
          },
        },
      },
      {
        name: 'Empty config',
        config: {
          dataSources: {
            http1: {
              type: 'HTTP',
              config: {},
            },
          },
        },
      },
      {
        name: 'Invalid config',
        config: {
          dataSources: {
            http1: {
              type: 'HTTP',
              config: {
                endpoint: 123,
                authorizationConfig: {
                  authorizationType: 'FOO',
                  awsIamConfig: {
                    signingRegion: 123,
                    signingServiceName: 456,
                  },
                },
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

describe('HTTP', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          dataSources: {
            http1: {
              type: 'HTTP',
              config: {
                endpoint: 'https://api.example.com',
              },
            },
            http2: {
              type: 'HTTP',
              config: {
                endpoint: { 'Fn::GetAtt': ['MyEndpoint', 'Arn'] },
                authorizationConfig: {
                  authorizationType: 'AWS_IAM',
                  awsIamConfig: {
                    signingRegion: 'us-east-1',
                    signingServiceName: 'AppSync',
                  },
                },
              },
            },
            http3: {
              type: 'HTTP',
              config: {
                endpoint: 'https://api.example.com',
                serviceRoleArn: { Ref: 'MyRole' },
              },
            },
            http5: {
              type: 'HTTP',
              config: {
                endpoint: 'https://api.example.com',
                iamRoleStatements: [
                  {
                    Effect: 'Allow',
                    Action: ['lambda:invokeFunction'],
                    Resource: ['arn:lambda:'],
                  },
                ],
              },
            },
          },
        },
      },
      {
        name: 'Valid config, as array of maps',
        config: {
          dataSources: [
            {
              http1: {
                type: 'HTTP',
                config: {
                  endpoint: 'https://api.example.com',
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
        name: 'Missing config',
        config: {
          dataSources: {
            http1: {
              type: 'HTTP',
            },
          },
        },
      },
      {
        name: 'Empty config',
        config: {
          dataSources: {
            http1: {
              type: 'HTTP',
              config: {},
            },
          },
        },
      },
      {
        name: 'Invalid config',
        config: {
          dataSources: {
            http1: {
              type: 'HTTP',
              config: {
                endpoint: 123,
                authorizationConfig: {
                  authorizationType: 'FOO',
                  awsIamConfig: {
                    signingRegion: 123,
                    signingServiceName: 456,
                  },
                },
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

describe('OpenSearch', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          dataSources: {
            openSearch1: {
              type: 'AMAZON_OPENSEARCH_SERVICE',
              config: {
                endpoint: 'https://api.example.com',
              },
            },
            openSearch2: {
              type: 'AMAZON_OPENSEARCH_SERVICE',
              config: {
                endpoint: { 'Fn::GetAtt': ['MyEndpoint', 'Arn'] },
              },
            },
            openSearch3: {
              type: 'AMAZON_OPENSEARCH_SERVICE',
              config: {
                domain: '123',
              },
            },
            openSearch4: {
              type: 'AMAZON_OPENSEARCH_SERVICE',
              config: {
                endpoint: 'https://api.example.com',
                region: 'us-east-1',
                serviceRoleArn: 'aws:arn:iam',
              },
            },
            openSearch5: {
              type: 'AMAZON_OPENSEARCH_SERVICE',
              config: {
                endpoint: 'https://api.example.com',
                iamRoleStatements: [
                  {
                    Effect: 'Allow',
                    Action: ['lambda:invokeFunction'],
                    Resource: ['arn:lambda:'],
                  },
                ],
              },
            },
          },
        },
      },
      {
        name: 'Valid config, as array of maps',
        config: {
          dataSources: [
            {
              openSearch1: {
                type: 'AMAZON_OPENSEARCH_SERVICE',
                config: {
                  endpoint: 'https://api.example.com',
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
        name: 'Missing config',
        config: {
          dataSources: {
            openSearch1: {
              type: 'AMAZON_OPENSEARCH_SERVICE',
            },
          },
        },
      },
      {
        name: 'Empty config',
        config: {
          dataSources: {
            openSearch1: {
              type: 'AMAZON_OPENSEARCH_SERVICE',
              config: {},
            },
          },
        },
      },
      {
        name: 'Invalid config',
        config: {
          dataSources: {
            openSearch1: {
              type: 'AMAZON_OPENSEARCH_SERVICE',
              config: {
                endpoint: 123,
                region: 456,
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

describe('None', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          dataSources: {
            none: {
              type: 'NONE',
            },
          },
        },
      },
      {
        name: 'Valid config, as array of maps',
        config: {
          dataSources: [
            {
              openSearch1: {
                type: 'NONE',
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
})
