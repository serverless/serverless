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
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { default: Serverless } = await import(
  '../../../../../../../../../../lib/serverless.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: AwsCompileApigEvents } = await import(
  '../../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index.js'
)

describe('#validate()', () => {
  let serverless
  let awsCompileApigEvents
  let options

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    options = { stage: 'dev', region: 'us-east-1' }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    serverless.service.service = 'first-service'
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    }
    serverless.service.functions = {}
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options)
  })

  it('should ignore non-http events', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [{ ignored: {} }],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events).toBeInstanceOf(Array)
    expect(validated.events.length).toBe(0)
  })

  it('should reject an invalid http event', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [{ http: true }],
      },
    }
    expect(() => awsCompileApigEvents.validate()).toThrow()
  })

  it('should filter non-http events', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [{ http: { method: 'GET', path: 'foo/bar' } }, {}],
      },
      second: {
        events: [{ other: {} }],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events).toBeInstanceOf(Array)
    expect(validated.events.length).toBe(1)
  })

  it('should discard a starting slash from paths', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          { http: { method: 'POST', path: '/foo/bar' } },
          { http: 'GET /foo/bar' },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events.length).toBe(2)
    expect(validated.events[0].http.path).toBe('foo/bar')
    expect(validated.events[1].http.path).toBe('foo/bar')
  })

  it('should throw if cognito claims are being used with lambda proxy', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              integration: 'lambda-proxy',
              authorizer: {
                arn: 'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
                claims: ['email', 'nickname'],
              },
            },
          },
        ],
      },
    }
    expect(() => awsCompileApigEvents.validate()).toThrow()
  })

  it('should not throw if cognito claims are undefined with lambda proxy', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: '/{proxy+}',
              method: 'ANY',
              integration: 'lambda-proxy',
              authorizer: {
                arn: 'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
                name: 'CognitoAuthorizer',
              },
            },
          },
        ],
      },
    }
    expect(() => awsCompileApigEvents.validate()).not.toThrow()
  })

  it('should not throw if cognito claims are empty arrays with lambda proxy', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: '/{proxy+}',
              method: 'ANY',
              integration: 'lambda-proxy',
              authorizer: {
                arn: 'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
                name: 'CognitoAuthorizer',
                claims: [],
              },
            },
          },
        ],
      },
    }
    expect(() => awsCompileApigEvents.validate()).not.toThrow()
  })

  it('should accept AWS_IAM as authorizer', () => {
    awsCompileApigEvents.serverless.service.functions = {
      foo: {},
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: 'aws_iam',
            },
          },
        ],
      },
      second: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/baz',
              authorizer: { type: 'aws_iam' },
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events.length).toBe(2)
    expect(validated.events[0].http.authorizer.type).toBe('AWS_IAM')
    expect(validated.events[1].http.authorizer.type).toBe('AWS_IAM')
  })

  it('should accept an authorizer as a string', () => {
    awsCompileApigEvents.serverless.service.functions = {
      foo: {},
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: 'foo',
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events.length).toBe(1)
    expect(validated.events[0].http.authorizer.name).toBe('foo')
    expect(validated.events[0].http.authorizer.arn).toEqual({
      'Fn::GetAtt': ['FooLambdaFunction', 'Arn'],
    })
  })

  it('should set authorizer defaults', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: { arn: 'sss:dev-authorizer' },
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    const authorizer = validated.events[0].http.authorizer
    expect(authorizer.resultTtlInSeconds).toBe(300)
    expect(authorizer.identitySource).toBe(
      'method.request.header.Authorization',
    )
  })

  it('should support string syntax: METHOD path', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [{ http: 'GET users/list' }],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events.length).toBe(1)
    expect(validated.events[0].http.method).toBe('get')
    expect(validated.events[0].http.path).toBe('users/list')
  })

  it('should handle async: true', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              async: true,
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.async).toBe(true)
  })

  it('should set cors defaults when cors: true', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              cors: true,
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.cors).toBeDefined()
    // sf-core may structure cors differently, check methods array exists
    expect(validated.events[0].http.cors.methods).toBeDefined()
    expect(validated.events[0].http.cors.methods).toContain('OPTIONS')
    expect(validated.events[0].http.cors.methods).toContain('GET')
  })

  it('should handle cors configuration object', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              cors: {
                origins: ['https://example.com'],
                headers: ['Content-Type', 'Authorization'],
                allowCredentials: true,
              },
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.cors.origins).toEqual([
      'https://example.com',
    ])
    expect(validated.events[0].http.cors.headers).toContain('Content-Type')
    expect(validated.events[0].http.cors.allowCredentials).toBe(true)
  })

  it('should handle private: true', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              private: true,
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.private).toBe(true)
  })

  it('should process request.parameters', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/{id}',
              request: {
                parameters: {
                  paths: { id: true },
                  querystrings: { name: false },
                  headers: { 'X-Custom': true },
                },
              },
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.request.parameters).toBeDefined()
  })

  it('should process request.schemas', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: 'foo/bar',
              request: {
                schemas: {
                  'application/json': {
                    schema: { type: 'object' },
                    name: 'MyModel',
                    description: 'My model',
                  },
                },
              },
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.request.schemas).toBeDefined()
  })

  it('should handle response configuration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              integration: 'lambda',
              response: {
                headers: {
                  'Content-Type': "'application/json'",
                },
                template: "$input.json('$')",
                statusCodes: {
                  200: { pattern: '' },
                  400: { pattern: '.*Error.*' },
                },
              },
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.response).toBeDefined()
  })

  it('should handle integration: lambda', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              integration: 'lambda',
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.integration).toBe('AWS')
  })

  it('should handle integration: mock', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              integration: 'mock',
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.integration).toBe('MOCK')
  })

  it('should default to lambda-proxy integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.integration).toBe('AWS_PROXY')
  })

  it('should populate validated.events with function info', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [{ http: 'GET foo/bar' }],
      },
      second: {
        events: [{ http: 'POST foo/bar' }],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events).toBeDefined()
    expect(validated.events.length).toBe(2)
    expect(validated.events[0].functionName).toBe('first')
    expect(validated.events[1].functionName).toBe('second')
  })

  it('should set cors.methods to include OPTIONS automatically', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              cors: {
                origins: ['*'],
              },
            },
          },
        ],
      },
    }
    const validated = awsCompileApigEvents.validate()
    expect(validated.events[0].http.cors.methods).toContain('OPTIONS')
  })

  it('should throw when authorizer scopes are used without an authorizer', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: {
                scopes: ['read:users'],
              },
            },
          },
        ],
      },
    }
    // Should throw or handle scopes requirement
    expect(() => awsCompileApigEvents.validate()).toThrow()
  })
})
