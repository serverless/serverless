import { describe, it, expect } from '@jest/globals'
import { validateMcp } from '../../../../../../lib/plugins/aws/mcp/lib/validate.js'
// The real naming module, threaded in the same way the plugin threads
// `provider.naming` - so the logical ids these collision assertions talk about
// are the ones the provider actually emits.
import naming from '../../../../../../lib/plugins/aws/lib/naming.js'

const base = { servers: { crm: { server: 'src/server.mjs' } } }

describe('validateMcp', () => {
  it('applies defaults: timeout 60, runtime nodejs24.x', () => {
    const { servers } = validateMcp({
      mcp: base,
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers).toEqual([
      expect.objectContaining({
        name: 'crm',
        server: 'src/server.mjs',
        timeout: 60,
        runtime: 'nodejs24.x',
      }),
    ])
  })

  it('honors provider.runtime nodejs20.x/22.x/24.x', () => {
    for (const runtime of ['nodejs20.x', 'nodejs22.x', 'nodejs24.x']) {
      const { servers } = validateMcp({
        mcp: base,
        functions: {},
        providerRuntime: runtime,
        naming,
      })
      expect(servers[0].runtime).toBe(runtime)
    }
  })

  it('uses nodejs24.x when provider.runtime is not a Node runtime', () => {
    const { servers } = validateMcp({
      mcp: base,
      functions: {},
      providerRuntime: 'python3.12',
      naming,
    })
    expect(servers[0].runtime).toBe('nodejs24.x')
  })

  it('honors Node runtimes newer than the known set', () => {
    const { servers } = validateMcp({
      mcp: base,
      functions: {},
      providerRuntime: 'nodejs26.x',
      naming,
    })
    expect(servers[0].runtime).toBe('nodejs26.x')
  })

  it.each(['nodejs16.x', 'nodejs18.x'])(
    'hard-errors on provider.runtime %s',
    (providerRuntime) => {
      expect(() =>
        validateMcp({ mcp: base, functions: {}, providerRuntime, naming }),
      ).toThrow(
        expect.objectContaining({
          code: 'MCP_UNSUPPORTED_NODE_RUNTIME',
          message: expect.stringContaining(providerRuntime),
        }),
      )
    },
  )

  it('errors when a server name collides with a function key', () => {
    expect(() =>
      validateMcp({
        mcp: base,
        functions: { crm: { handler: 'x.h' } },
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(expect.objectContaining({ code: 'MCP_FUNCTION_NAME_COLLISION' }))
  })

  it('errors when a colliding function key is declared with a null value', () => {
    expect(() =>
      validateMcp({
        mcp: base,
        functions: { crm: null },
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(expect.objectContaining({ code: 'MCP_FUNCTION_NAME_COLLISION' }))
  })

  // Naming normalization maps `-` to `Dash`, so distinct identifiers can land on
  // one `LambdaFunction` logical id and silently overwrite each other's
  // CloudFormation resource.
  it('errors when a server name normalizes onto an existing function', () => {
    expect(() =>
      validateMcp({
        mcp: { servers: { 'foo-bar': { server: 'src/server.mjs' } } },
        functions: { fooDashbar: { handler: 'x.h' } },
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_FUNCTION_NAME_COLLISION',
        message: expect.stringContaining('FooDashbar'),
      }),
    )
  })

  it('names both colliding identifiers in the message', () => {
    let message
    try {
      validateMcp({
        mcp: { servers: { 'foo-bar': { server: 'src/server.mjs' } } },
        functions: { fooDashbar: { handler: 'x.h' } },
        providerRuntime: undefined,
        naming,
      })
    } catch (error) {
      message = error.message
    }
    expect(message).toContain('foo-bar')
    expect(message).toContain('fooDashbar')
  })

  it('errors when two server names normalize to the same logical id', () => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            'Foo-bar': { server: 'src/a.mjs' },
            'foo-bar': { server: 'src/b.mjs' },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_FUNCTION_NAME_COLLISION',
        message: expect.stringContaining('FooDashbar'),
      }),
    )
  })

  it('accepts server names that normalize distinctly', () => {
    const { servers } = validateMcp({
      mcp: {
        servers: {
          'foo-bar': { server: 'src/a.mjs' },
          foo_bar: { server: 'src/b.mjs' },
          fooBar: { server: 'src/c.mjs' },
        },
      },
      functions: { other: { handler: 'x.h' } },
      providerRuntime: undefined,
      naming,
    })
    expect(servers.map((s) => s.name)).toEqual(['foo-bar', 'foo_bar', 'fooBar'])
  })

  // Under configValidationMode "warn" (the default) schema violations do not
  // stop the run, so entries of any shape reach validateMcp. A `servers`
  // block signals intent to use MCP servers, so a malformed entry gets a
  // teaching error rather than a TypeError.
  it.each([
    ['a number', 42],
    ['null', null],
    ['an array', ['src/server.mjs']],
    ['an object without server', { timeout: 60 }],
    ['a non-string server', { server: 42 }],
    ['an empty server', { server: '' }],
  ])('rejects a server entry that is %s', (_label, entry) => {
    expect(() =>
      validateMcp({
        mcp: { servers: { crm: entry } },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(expect.objectContaining({ code: 'MCP_SERVER_MODULE_REQUIRED' }))
  })

  it('rejects the reserved server name "well-known"', () => {
    expect(() =>
      validateMcp({
        mcp: { servers: { 'well-known': { server: 'src/server.mjs' } } },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_RESERVED_SERVER_NAME',
        message: expect.stringContaining('oauthDiscovery documents'),
      }),
    )
  })

  // `Object.assign`ing a `__proto__` key onto the functions object triggers the
  // prototype setter instead of defining a property, so the function would
  // silently vanish and resurface much later as an unknown-function error.
  it('rejects the reserved server name "__proto__"', () => {
    // A computed key defines an own property; the plain `__proto__:` spelling in
    // an object literal would set the prototype instead (which is exactly the
    // hazard this reservation guards against downstream).
    expect(() =>
      validateMcp({
        mcp: { servers: { ['__proto__']: { server: 'src/server.mjs' } } },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(expect.objectContaining({ code: 'MCP_RESERVED_SERVER_NAME' }))
  })

  it('rejects the reserved server name in any letter case', () => {
    for (const name of ['Well-Known', 'WELL-KNOWN']) {
      expect(() =>
        validateMcp({
          mcp: { servers: { [name]: { server: 'src/server.mjs' } } },
          functions: {},
          providerRuntime: undefined,
          naming,
        }),
      ).toThrow(expect.objectContaining({ code: 'MCP_RESERVED_SERVER_NAME' }))
    }
  })

  // `naming` methods are plugin-overridable, and the emitted logical ids come
  // from `provider.naming` - so the collision check has to consult the same
  // object rather than the naming module it could import directly.
  it('detects collisions through the supplied naming, not a module import', () => {
    const collapsingNaming = {
      getNormalizedFunctionName: () => 'Same',
    }
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: { server: 'src/a.mjs' },
            billing: { server: 'src/b.mjs' },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming: collapsingNaming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_FUNCTION_NAME_COLLISION',
        message: expect.stringContaining('SameLambdaFunction'),
      }),
    )
  })

  it('accepts other dash-separated server names', () => {
    const { servers } = validateMcp({
      mcp: { servers: { 'my-server': { server: 'src/server.mjs' } } },
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers[0].name).toBe('my-server')
  })

  it('does not treat inherited Object properties as function collisions', () => {
    const { servers } = validateMcp({
      mcp: { servers: { constructor: { server: 'src/server.mjs' } } },
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers[0].name).toBe('constructor')
  })

  it('normalizes every server, sharing the resolved runtime', () => {
    const { servers } = validateMcp({
      mcp: {
        servers: {
          crm: { server: 'src/crm.mjs' },
          billing: { server: 'src/billing.mjs', timeout: 300 },
        },
      },
      functions: {},
      providerRuntime: 'nodejs22.x',
      naming,
    })
    expect(servers).toEqual([
      expect.objectContaining({
        name: 'crm',
        server: 'src/crm.mjs',
        timeout: 60,
        runtime: 'nodejs22.x',
      }),
      expect.objectContaining({
        name: 'billing',
        server: 'src/billing.mjs',
        timeout: 300,
        runtime: 'nodejs22.x',
      }),
    ])
  })

  it.each([
    'arn:aws:ssm:us-east-1:123456789012:parameter/mcp-key',
    'arn:aws-us-gov:secretsmanager:us-gov-west-1:123456789012:secret:mcp-key-AbCdEf',
  ])('accepts a bring-your-own state key ARN: %s', (state) => {
    const { servers } = validateMcp({
      mcp: { servers: { crm: { server: 'src/server.mjs', state } } },
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers[0].state).toBe(state)
  })

  // The partition is what `stateIamStatement` reads back out of the ARN to pick
  // between `ssm:GetParameter` and `secretsmanager:GetSecretValue`, and its
  // matcher requires a non-empty partition - so an empty one must not get past
  // validation into a statement that would silently be built for the wrong
  // service.
  it.each([
    'arn::ssm:us-east-1:123456789012:parameter/mcp-key',
    'arn::secretsmanager:us-east-1:123456789012:secret:mcp-key',
  ])('rejects a state ARN with an empty partition: %s', (state) => {
    expect(() =>
      validateMcp({
        mcp: { servers: { crm: { server: 'src/server.mjs', state } } },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(expect.objectContaining({ code: 'MCP_INVALID_STATE_ARN' }))
  })

  it('rejects a state ARN that is neither SSM nor Secrets Manager', () => {
    const state = 'arn:aws:s3:::my-bucket/mcp-key'
    expect(() =>
      validateMcp({
        mcp: { servers: { crm: { server: 'src/server.mjs', state } } },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_INVALID_STATE_ARN',
        message: expect.stringContaining(state),
      }),
    )
  })

  // Only a literal ARN carries the service that decides between
  // `ssm:GetParameter` and `secretsmanager:GetSecretValue`, so an intrinsic is
  // refused here too - not just at the schema level.
  it('rejects a CloudFormation intrinsic for state', () => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              state: { 'Fn::Sub': 'arn:aws:ssm:${AWS::Region}:1:parameter/x' },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_INVALID_STATE_ARN',
        message: expect.stringContaining('literal'),
      }),
    )
  })

  it('passes through memorySize, environment, authorizer and state', () => {
    const authorizer = { name: 'authorizerFn', resultTtlInSeconds: 0 }
    const mcp = {
      servers: {
        crm: {
          server: 'src/server.mjs',
          timeout: 300,
          memorySize: 1024,
          environment: { A: 'b' },
          authorizer,
          state: true,
        },
      },
    }
    const { servers } = validateMcp({
      mcp,
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers[0]).toEqual(
      expect.objectContaining({
        timeout: 300,
        memorySize: 1024,
        environment: { A: 'b' },
        state: true,
      }),
    )
    // Verbatim: the object branch is handed to the http-event authorizer
    // compiler untouched, so nothing here may reshape it.
    expect(servers[0].authorizer).toBe(authorizer)
  })

  it('leaves authorizer and oauthDiscovery undefined when unset', () => {
    const { servers } = validateMcp({
      mcp: base,
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers[0].authorizer).toBeUndefined()
    expect(servers[0].oauthDiscovery).toBeUndefined()
  })

  it.each([
    ['a user authorizer function name', 'authorizerFn'],
    ['aws_iam', 'aws_iam'],
    ['AWS_IAM in any case', 'AWS_IAM'],
  ])('accepts a string authorizer: %s', (_label, authorizer) => {
    const { servers } = validateMcp({
      mcp: { servers: { crm: { server: 'src/server.mjs', authorizer } } },
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers[0].authorizer).toBe(authorizer)
  })

  // Parity with the http event: an object authorizer identified by any of
  // name/arn/authorizerId is legitimate, and so is naming more than one of
  // them - the Framework must not invent constraints http events lack.
  it.each([
    ['name', { name: 'authorizerFn' }],
    [
      'arn',
      {
        arn: 'arn:aws:lambda:us-east-1:123456789012:function:authorizerFn',
      },
    ],
    [
      'authorizerId alongside a type',
      { authorizerId: { Ref: 'ApiGatewayAuthorizer' }, type: 'request' },
      { authorizerId: { Ref: 'ApiGatewayAuthorizer' }, type: 'CUSTOM' },
    ],
    [
      'authorizerId alongside a name, which is what identifies it',
      { authorizerId: { Ref: 'ApiGatewayAuthorizer' }, name: 'authorizerFn' },
    ],
    [
      'authorizerId alongside an arn, which is what identifies it',
      {
        authorizerId: { Ref: 'ApiGatewayAuthorizer' },
        arn: 'arn:aws:lambda:us-east-1:123456789012:function:authorizerFn',
      },
    ],
    [
      'name and arn together',
      {
        name: 'authorizerFn',
        arn: 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/pool',
      },
    ],
    [
      'type aws_iam with no identifier',
      { type: 'aws_iam' },
      { type: 'AWS_IAM' },
    ],
    ['type AWS_IAM in any case', { type: 'AWS_IAM' }],
    [
      'a case-insensitive type from the http event set',
      { name: 'authorizerFn', type: 'COGNITO_USER_POOLS' },
    ],
  ])(
    'accepts an object authorizer identified by %s',
    (_label, authorizer, expected = authorizer) => {
      const { servers } = validateMcp({
        mcp: { servers: { crm: { server: 'src/server.mjs', authorizer } } },
        functions: {},
        providerRuntime: undefined,
        naming,
      })
      expect(servers[0].authorizer).toEqual(expected)
    },
  )

  it.each([
    ['an empty string', ''],
    ['a whitespace-only string', '   '],
    ['an array', []],
    ['null', null],
    ['an object with no identifier', {}],
    ['an object with only unrelated keys', { claims: ['sub'] }],
    ['an object whose identifiers are blank', { name: '  ' }],
    ['an unknown type', { name: 'authorizerFn', type: 'jwt' }],
    ['a non-string type', { name: 'authorizerFn', type: 42 }],
  ])('rejects an authorizer that is %s', (_label, authorizer) => {
    expect(() =>
      validateMcp({
        mcp: { servers: { crm: { server: 'src/server.mjs', authorizer } } },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_AUTHORIZER_INVALID',
        message: expect.stringContaining('mcp.servers.crm.authorizer'),
      }),
    )
  })

  // The api-gateway compiler reads `authorizerId` only from the
  // `type && authorizerId` branch of `getAuthorizer`
  // (api-gateway/lib/validate.js): a lone `authorizerId` matches no branch and
  // falls through to `API_GATEWAY_MISSING_AUTHORIZER_NAME_OR_ARN`, thrown at a
  // `functions.<name>.events` path the user never wrote. Same constraint, said
  // here instead - and only for the shape that actually dies, so an
  // `authorizerId` sitting next to a `name` or an `arn` keeps compiling exactly
  // as it does for an http event.
  // A literal Cognito pool ARN with no `name` compiles to an authorizer whose
  // CloudFormation logical id is derived from the ARN's tail - which for a pool
  // id always starts with a digit, and a logical id cannot. The deploy dies
  // inside CloudFormation against a resource name the user never wrote, so the
  // constraint is said here, where the configuration is.
  const cognitoPoolArn =
    'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_aBcDe12Fg'

  const validateAuthorizer = (authorizer) =>
    validateMcp({
      mcp: { servers: { crm: { server: 'src/server.mjs', authorizer } } },
      functions: {},
      providerRuntime: undefined,
      naming,
    })

  it('accepts a literal Cognito pool ARN carrying a name', () => {
    const authorizer = { name: 'mcpPool', arn: cognitoPoolArn }

    expect(validateAuthorizer(authorizer).servers[0].authorizer).toBe(
      authorizer,
    )
  })

  it('rejects a literal Cognito pool ARN with no name, naming the fix', () => {
    expect(() => validateAuthorizer({ arn: cognitoPoolArn })).toThrow(
      expect.objectContaining({
        code: 'MCP_AUTHORIZER_INVALID',
        message: expect.stringContaining('mcp.servers.crm.authorizer.name'),
      }),
    )
  })

  // A Lambda authorizer's derived name is a function-name tail, which is a legal
  // logical id - so the rule must not reach it.
  it('leaves a literal non-Cognito ARN with no name alone', () => {
    const authorizer = {
      arn: 'arn:aws:lambda:us-east-1:123456789012:function:authorizerFn',
    }

    expect(validateAuthorizer(authorizer).servers[0].authorizer).toBe(
      authorizer,
    )
  })

  // An intrinsic hides the ARN entirely, and the name the authorizer's logical
  // id is built from is derived from the ARN when it is not given - by calling
  // `.split(":")` on it. Handed an object that is a TypeError, not a teaching
  // error, so the requirement is said here.
  it.each([
    ['typeless', { arn: { 'Fn::GetAtt': ['UserPool', 'Arn'] } }],
    [
      'typed as a user pool',
      {
        type: 'cognito_user_pools',
        arn: { 'Fn::GetAtt': ['UserPool', 'Arn'] },
      },
    ],
    ['a Ref', { arn: { Ref: 'UserPoolArn' } }],
    ['blank-named', { arn: { Ref: 'UserPoolArn' }, name: '   ' }],
  ])('rejects an intrinsic arn with no name (%s)', (_label, authorizer) => {
    expect(() => validateAuthorizer(authorizer)).toThrow(
      expect.objectContaining({
        code: 'MCP_AUTHORIZER_INVALID',
        message: expect.stringContaining('mcp.servers.crm.authorizer.name'),
      }),
    )
  })

  // The documented same-stack pool shape: the intrinsic ARN with a name of the
  // user's own beside it. Nothing above may reach it.
  it('accepts an intrinsic arn carrying a name', () => {
    const authorizer = {
      type: 'COGNITO_USER_POOLS',
      arn: { 'Fn::GetAtt': ['UserPool', 'Arn'] },
      name: 'crmPool',
    }

    expect(validateAuthorizer(authorizer).servers[0].authorizer).toEqual(
      authorizer,
    )
  })

  // An ARN pasted where an http event would take one: the seam reads a bare
  // string carrying a colon as an authorizer ARN, so this is working http-event
  // muscle memory. Here the string names a function, so it is wrapped into
  // `{ name }` and the compile dies claiming the function does not exist -
  // pointing at `functions:` when the fix is the object form.
  it.each([
    [
      'a Cognito pool ARN',
      'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_aBcDe12Fg',
    ],
    [
      'a Lambda authorizer ARN',
      'arn:aws:lambda:us-east-1:123456789012:function:authorizerFn',
    ],
    ['anything else carrying a colon', 'some:thing'],
  ])('rejects a string authorizer that is %s', (_label, authorizer) => {
    expect(() => validateAuthorizer(authorizer)).toThrow(
      expect.objectContaining({
        code: 'MCP_AUTHORIZER_INVALID',
        message: expect.stringContaining('mcp.servers.crm.authorizer.arn'),
      }),
    )
  })

  it('rejects an authorizerId with no type, naming the fix', () => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              authorizer: { authorizerId: { Ref: 'ApiGatewayAuthorizer' } },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_AUTHORIZER_INVALID',
        message: expect.stringContaining('mcp.servers.crm.authorizer.type'),
      }),
    )
  })

  it('lists the accepted authorizer types when the type is unknown', () => {
    let message
    try {
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              authorizer: { name: 'authorizerFn', type: 'jwt' },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      })
    } catch (error) {
      message = error.message
    }
    for (const type of [
      'token',
      'cognito_user_pools',
      'request',
      'aws_iam',
      'custom',
    ]) {
      expect(message).toContain(type)
    }
  })

  // API Gateway's own vocabulary is uppercase, and the seam forwards `type`
  // into the compiled template in two places that do NOT fold its case: the
  // method's `AuthorizationType` when an existing authorizer is attached by id,
  // and - for a generated authorizer - the resource's own `Type`, which has no
  // `CUSTOM` member at all. So the canonical spelling is settled here, once,
  // for every casing the type is accepted in.
  it.each([
    // Attaching an existing authorizer by id: the method's AuthorizationType.
    ['by id', 'token', { authorizerId: 'abc123' }, 'CUSTOM'],
    ['by id', 'TOKEN', { authorizerId: 'abc123' }, 'CUSTOM'],
    ['by id', 'request', { authorizerId: 'abc123' }, 'CUSTOM'],
    ['by id', 'Request', { authorizerId: 'abc123' }, 'CUSTOM'],
    ['by id', 'custom', { authorizerId: 'abc123' }, 'CUSTOM'],
    ['by id', 'CUSTOM', { authorizerId: 'abc123' }, 'CUSTOM'],
    [
      'by id',
      'cognito_user_pools',
      { authorizerId: 'abc123' },
      'COGNITO_USER_POOLS',
    ],
    [
      'by id',
      'Cognito_User_Pools',
      { authorizerId: 'abc123' },
      'COGNITO_USER_POOLS',
    ],
    // A generated authorizer resource: TOKEN, REQUEST or COGNITO_USER_POOLS are
    // the only types that exist, and `custom` means the default of the three.
    ['by name', 'token', { name: 'authorizerFn' }, 'TOKEN'],
    ['by name', 'Token', { name: 'authorizerFn' }, 'TOKEN'],
    ['by name', 'custom', { name: 'authorizerFn' }, 'TOKEN'],
    ['by name', 'CUSTOM', { name: 'authorizerFn' }, 'TOKEN'],
    ['by name', 'request', { name: 'authorizerFn' }, 'REQUEST'],
    ['by name', 'REQUEST', { name: 'authorizerFn' }, 'REQUEST'],
    [
      'by pool arn',
      'cognito_user_pools',
      {
        name: 'crmPool',
        arn: 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_aBcDe12Fg',
      },
      'COGNITO_USER_POOLS',
    ],
    // The one type API Gateway resolves without an authorizer resource.
    ['by name', 'aws_iam', { name: 'authorizerFn' }, 'AWS_IAM'],
    ['by nothing', 'Aws_Iam', {}, 'AWS_IAM'],
  ])(
    'canonicalizes an authorizer identified %s with type "%s" to "%s"',
    (_shape, type, rest, expectedType) => {
      const { servers } = validateAuthorizer({ ...rest, type })
      expect(servers[0].authorizer).toEqual({ ...rest, type: expectedType })
    },
  )

  it('leaves a typeless authorizer object exactly as written', () => {
    const authorizer = { name: 'authorizerFn', resultTtlInSeconds: 0 }
    expect(validateAuthorizer(authorizer).servers[0].authorizer).toBe(
      authorizer,
    )
  })

  it('canonicalizes onto a copy, never the user configuration', () => {
    const authorizer = { name: 'authorizerFn', type: 'request' }
    const { servers } = validateAuthorizer(authorizer)
    expect(authorizer.type).toBe('request')
    expect(servers[0].authorizer).not.toBe(authorizer)
  })

  // `aws_iam` means API Gateway resolves the caller itself, with no authorizer
  // to attach - so an `authorizerId` beside it is a contradiction, and the
  // compiler resolves it by silently dropping the id.
  it('rejects aws_iam beside an authorizerId', () => {
    expect(() =>
      validateAuthorizer({ type: 'aws_iam', authorizerId: 'abc123' }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_AUTHORIZER_INVALID',
        message: expect.stringContaining(
          'mcp.servers.crm.authorizer.authorizerId',
        ),
      }),
    )
  })

  // `authorizer.name` is `{type: 'string'}` in the schema, which only WARNS
  // under the default validation mode - so a non-string one reaches here. The
  // seam derives the name from the ARN in that case (`typeof name === 'string'`
  // is its test), and the service packages. Nothing here may turn that into a
  // TypeError on the way to a logical id.
  it.each([
    [
      'an intrinsic name beside a literal ARN',
      {
        name: { Ref: 'AuthName' },
        arn: 'arn:aws:lambda:us-east-1:123456789012:function:authorizerFn',
      },
    ],
    ['an intrinsic name alone', { name: { Ref: 'AuthName' } }],
    [
      'a numeric name',
      {
        name: 42,
        arn: 'arn:aws:lambda:us-east-1:123456789012:function:authorizerFn',
      },
    ],
  ])('tolerates %s', (_label, authorizer) => {
    expect(() => validateAuthorizer(authorizer)).not.toThrow()
  })

  // Two authorizers whose names normalize to one CloudFormation logical id
  // compile to ONE authorizer resource, the later definition overwriting the
  // earlier - so one server silently ends up guarded by the other's authorizer.
  it('rejects two servers whose authorizers collide on one logical id', () => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/a.mjs',
              authorizer: { name: 'auth-a', arn: { Ref: 'StrongAuthArn' } },
            },
            billing: {
              server: 'src/b.mjs',
              authorizer: { name: 'authDasha', arn: { Ref: 'WeakAuthArn' } },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_AUTHORIZER_NAME_COLLISION',
        message: expect.stringMatching(
          /crm[\s\S]*billing[\s\S]*AuthDashaApiGatewayAuthorizer|billing[\s\S]*crm[\s\S]*AuthDashaApiGatewayAuthorizer/,
        ),
      }),
    )
  })

  // Two servers behind the SAME authorizer is the ordinary way to share one:
  // it compiles to one resource because it IS one authorizer.
  it.each([
    ['the string form', 'authorizerFn', 'authorizerFn'],
    ['the object form', { name: 'authorizerFn' }, { name: 'authorizerFn' }],
    // The string form and the object form of the same function name describe
    // the same authorizer, and compile to the same resource.
    ['both spellings of one name', 'authorizerFn', { name: 'authorizerFn' }],
    // An unwritten type IS `token` for a generated Lambda authorizer, so the
    // two compile to byte-identical resources.
    [
      'one name with the type left to its default on one side',
      'authorizerFn',
      { name: 'authorizerFn', type: 'token' },
    ],
    [
      'a pool ARN with the type left to its default on one side',
      {
        name: 'crmPool',
        arn: 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_aBcDe12Fg',
      },
      {
        name: 'crmPool',
        arn: 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_aBcDe12Fg',
        type: 'COGNITO_USER_POOLS',
      },
    ],
  ])(
    'accepts two servers sharing one authorizer written as %s',
    (_label, first, second) => {
      const { servers } = validateMcp({
        mcp: {
          servers: {
            crm: { server: 'src/a.mjs', authorizer: first },
            billing: { server: 'src/b.mjs', authorizer: second },
          },
        },
        functions: { authorizerFn: { handler: 'auth.handler' } },
        providerRuntime: undefined,
        naming,
      })
      expect(servers).toHaveLength(2)
    },
  )

  // `compileAuthorizers` merges by logical id over EVERY validated event, not
  // only the contributed ones - so an http event's authorizer collapses with an
  // MCP server's exactly as two MCP servers' do, and the MCP route can end up
  // guarded by the http event's authorizer.
  it('rejects an MCP authorizer colliding with an http event authorizer', () => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/a.mjs',
              authorizer: { name: 'authDasha', arn: { Ref: 'StrongAuthArn' } },
            },
          },
        },
        functions: {
          web: {
            handler: 'web.h',
            events: [
              {
                http: {
                  path: 'web',
                  method: 'get',
                  authorizer: {
                    name: 'auth-a',
                    arn: 'arn:aws:lambda:us-east-1:123456789012:function:weak',
                  },
                },
              },
            ],
          },
        },
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({ code: 'MCP_AUTHORIZER_NAME_COLLISION' }),
    )
  })

  it('names the http event and its function on the other side of the collision', () => {
    let message
    try {
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/a.mjs',
              authorizer: { name: 'authDasha', arn: { Ref: 'StrongAuthArn' } },
            },
          },
        },
        functions: {
          web: {
            handler: 'web.h',
            events: [
              {
                http: {
                  path: 'reports/{id}',
                  method: 'get',
                  authorizer: {
                    name: 'auth-a',
                    arn: 'arn:aws:lambda:us-east-1:123456789012:function:weak',
                  },
                },
              },
            ],
          },
        },
        providerRuntime: undefined,
        naming,
      })
    } catch (error) {
      message = error.message
    }
    for (const fragment of [
      'crm',
      'web',
      'reports/{id}',
      'AuthDashaApiGatewayAuthorizer',
    ]) {
      expect(message).toContain(fragment)
    }
  })

  // One authorizer used by an http event AND an MCP server is the ordinary way
  // to guard both with the same gate.
  it.each([
    ['identically', 'authorizerFn', 'authorizerFn'],
    ['as a string and as an object', 'authorizerFn', { name: 'authorizerFn' }],
    [
      'with the type left to its default on one side',
      { name: 'authorizerFn' },
      { name: 'authorizerFn', type: 'token' },
    ],
  ])(
    'accepts an http event and an MCP server naming one authorizer %s',
    (_label, mcpAuthorizer, httpAuthorizer) => {
      const { servers } = validateMcp({
        mcp: {
          servers: { crm: { server: 'src/a.mjs', authorizer: mcpAuthorizer } },
        },
        functions: {
          authorizerFn: { handler: 'auth.handler' },
          web: {
            handler: 'web.h',
            events: [
              {
                http: {
                  path: 'web',
                  method: 'get',
                  authorizer: httpAuthorizer,
                },
              },
            ],
          },
        },
        providerRuntime: undefined,
        naming,
      })
      expect(servers).toHaveLength(1)
    },
  )

  // Two http events colliding with each other is the compiler's own
  // pre-existing behavior, on config this plugin did not author. Surfacing it
  // from the MCP validator would fail services that have nothing to do with
  // MCP.
  it('leaves a collision between two http event authorizers alone', () => {
    const httpEvent = (name, fn) => ({
      http: {
        path: fn,
        method: 'get',
        authorizer: {
          name,
          arn: `arn:aws:lambda:us-east-1:123456789012:function:${fn}`,
        },
      },
    })
    const { servers } = validateMcp({
      mcp: { servers: { crm: { server: 'src/a.mjs' } } },
      functions: {
        a: { handler: 'a.h', events: [httpEvent('auth-a', 'a')] },
        b: { handler: 'b.h', events: [httpEvent('authDasha', 'b')] },
      },
      providerRuntime: undefined,
      naming,
    })
    expect(servers).toHaveLength(1)
  })

  // Every one of these is a shape an http event can arrive in under the
  // default validation mode. Reading them may not throw.
  it.each([
    ['a function with no events', { web: { handler: 'web.h' } }],
    ['a null function', { web: null }],
    ['non-array events', { web: { handler: 'web.h', events: {} } }],
    [
      'a shorthand http event',
      { web: { handler: 'web.h', events: [{ http: 'GET /w' }] } },
    ],
    [
      'a non-http event',
      { web: { handler: 'web.h', events: [{ sqs: 'arn:x' }] } },
    ],
    ['a null event', { web: { handler: 'web.h', events: [null] } }],
    [
      'an http event with no authorizer',
      {
        web: {
          handler: 'web.h',
          events: [{ http: { path: 'w', method: 'get' } }],
        },
      },
    ],
    [
      'an http event whose authorizer is an ARN string',
      {
        web: {
          handler: 'web.h',
          events: [
            {
              http: {
                path: 'w',
                method: 'get',
                authorizer:
                  'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_aBcDe12Fg',
              },
            },
          ],
        },
      },
    ],
    [
      'an http event whose authorizer name is an intrinsic',
      {
        web: {
          handler: 'web.h',
          events: [
            {
              http: {
                path: 'w',
                method: 'get',
                authorizer: { name: { Ref: 'AuthName' } },
              },
            },
          ],
        },
      },
    ],
  ])('reads %s without throwing', (_label, functions) => {
    expect(() =>
      validateMcp({
        mcp: { servers: { crm: { server: 'src/a.mjs', authorizer: 'gate' } } },
        functions,
        providerRuntime: undefined,
        naming,
      }),
    ).not.toThrow()
  })

  // `aws_iam` and an authorizer attached by id build no authorizer resource of
  // this stack's own, so neither can collide with anything.
  it.each([
    ['aws_iam', 'aws_iam'],
    ['an authorizer attached by id', { authorizerId: 'abc123', type: 'token' }],
  ])('does not collide two servers on %s', (_label, authorizer) => {
    const { servers } = validateMcp({
      mcp: {
        servers: {
          crm: { server: 'src/a.mjs', authorizer },
          billing: { server: 'src/b.mjs', authorizer },
        },
      },
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers).toHaveLength(2)
  })

  it('normalizes oauthDiscovery, trimming issuer and publicUrl', () => {
    const { servers } = validateMcp({
      mcp: {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: {
              issuer: ' https://acme.auth0.com ',
              publicUrl: ' https://mcp.acme.com/base ',
            },
          },
        },
      },
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers[0].oauthDiscovery).toEqual({
      issuer: 'https://acme.auth0.com',
      publicUrl: 'https://mcp.acme.com/base',
    })
  })

  it('omits publicUrl from oauthDiscovery when it is not set', () => {
    const { servers } = validateMcp({
      mcp: {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: { issuer: 'https://acme.auth0.com' },
          },
        },
      },
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers[0].oauthDiscovery).toEqual({
      issuer: 'https://acme.auth0.com',
    })
  })

  // A blank issuer would deploy a discovery document advertising a blank
  // authorization server, which every client would fail on - so it is caught
  // here rather than at deploy time.
  it.each([
    ['an empty object', {}],
    ['a string', 'https://acme.auth0.com'],
    ['an array', []],
    ['null', null],
    ['an empty issuer', { issuer: '' }],
    ['a whitespace-only issuer', { issuer: '   ' }],
    ['a non-string issuer', { issuer: 42 }],
  ])('rejects oauthDiscovery that is %s', (_label, oauthDiscovery) => {
    expect(() =>
      validateMcp({
        mcp: { servers: { crm: { server: 'src/server.mjs', oauthDiscovery } } },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_ISSUER_REQUIRED',
        message: expect.stringContaining('mcp.servers.crm.oauthDiscovery'),
      }),
    )
  })

  it.each([
    ['http', 'http://acme.auth0.com'],
    ['a host-less https URL', 'https://'],
    ['an empty-host https URL', 'https:///path'],
    ['a value that is not a URL', 'acme.auth0.com'],
  ])('rejects an oauthDiscovery issuer that is %s', (_label, issuer) => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: { server: 'src/server.mjs', oauthDiscovery: { issuer } },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_ISSUER_NOT_HTTPS',
        message: expect.stringContaining(
          'mcp.servers.crm.oauthDiscovery.issuer',
        ),
      }),
    )
  })

  it.each([
    ['http', 'http://mcp.acme.com'],
    ['a host-less https URL', 'https://'],
    ['an empty-host https URL', 'https:///path'],
    ['a value that is not a URL', 'mcp.acme.com'],
    ['blank', '   '],
    ['a non-string', 42],
  ])('rejects an oauthDiscovery publicUrl that is %s', (_label, publicUrl) => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              oauthDiscovery: {
                issuer: 'https://acme.auth0.com',
                publicUrl,
              },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_PUBLIC_URL_NOT_HTTPS',
        message: expect.stringContaining(
          'mcp.servers.crm.oauthDiscovery.publicUrl',
        ),
      }),
    )
  })

  // The discovery document is published as an API Gateway response template,
  // which Velocity evaluates on every request: "$" opens a reference and "#" a
  // directive, so either one lands in the document a client reads as something
  // other than what was written. Caught at config time, because the damage is
  // silent - the deploy succeeds and the served document is simply wrong.
  it.each([
    ['a dollar sign', 'https://acme.auth0.com/$tenant'],
    ['a bare dollar sign', 'https://acme$.auth0.com'],
    ['a hash', 'https://acme.auth0.com/#tenant'],
    ['a hash in the host', 'https://acme#.auth0.com'],
  ])('rejects an oauthDiscovery issuer containing %s', (_label, issuer) => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: { server: 'src/server.mjs', oauthDiscovery: { issuer } },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_ISSUER_NOT_HTTPS',
        message: expect.stringContaining(
          'mcp.servers.crm.oauthDiscovery.issuer',
        ),
      }),
    )
  })

  it.each([
    ['a dollar sign', 'https://mcp.acme.com/$stage'],
    ['a hash', 'https://mcp.acme.com/#stage'],
  ])(
    'rejects an oauthDiscovery publicUrl containing %s',
    (_label, publicUrl) => {
      expect(() =>
        validateMcp({
          mcp: {
            servers: {
              crm: {
                server: 'src/server.mjs',
                oauthDiscovery: {
                  issuer: 'https://acme.auth0.com',
                  publicUrl,
                },
              },
            },
          },
          functions: {},
          providerRuntime: undefined,
          naming,
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'MCP_OAUTH_DISCOVERY_PUBLIC_URL_NOT_HTTPS',
          message: expect.stringContaining(
            'mcp.servers.crm.oauthDiscovery.publicUrl',
          ),
        }),
      )
    },
  )

  // The server's route is appended to `publicUrl`, so a query string on it
  // would end up in the middle of the resource URL
  // ("https://mcp.acme.com/base?tenant=acme/crm/mcp") - an address that reaches
  // nothing. A base URL carrying a query is never a real front door.
  it.each([
    ['a query string', 'https://mcp.acme.com/base?tenant=acme'],
    ['an empty query string', 'https://mcp.acme.com/base?'],
    ['a query string on the host', 'https://mcp.acme.com?tenant=acme'],
  ])('rejects an oauthDiscovery publicUrl carrying %s', (_label, publicUrl) => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              oauthDiscovery: {
                issuer: 'https://acme.auth0.com',
                publicUrl,
              },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_PUBLIC_URL_NOT_HTTPS',
        message: expect.stringMatching(
          /query[\s\S]*mcp\.servers\.crm\.oauthDiscovery\.publicUrl/,
        ),
      }),
    )
  })

  // Every value quoted into these messages goes through JSON.stringify, so a
  // quote inside one cannot garble the sentence around it.
  it('quotes a hostile issuer into the message rather than interpolating it', () => {
    let message
    try {
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              oauthDiscovery: { issuer: 'ftp://acme".auth0.com' },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      })
    } catch (error) {
      message = error.message
    }
    expect(message).toContain(JSON.stringify('ftp://acme".auth0.com'))
  })

  // The issuer may be an intrinsic; `publicUrl` may not. It names the front
  // door in front of this service - never a same-stack resource - and it is
  // printed in the endpoint summary, which has no CloudFormation to render it.
  it.each([
    ['a Ref', { Ref: 'DomainName' }],
    ['an Fn::Sub', { 'Fn::Sub': 'https://${DomainName}' }],
    ['an Fn::GetAtt', { 'Fn::GetAtt': ['Domain', 'DomainName'] }],
  ])('rejects an oauthDiscovery publicUrl that is %s', (_label, publicUrl) => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              oauthDiscovery: {
                issuer: 'https://acme.auth0.com',
                publicUrl,
              },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_PUBLIC_URL_NOT_HTTPS',
        message: expect.stringMatching(
          /CloudFormation intrinsic[\s\S]*mcp\.servers\.crm\.oauthDiscovery\.publicUrl/,
        ),
      }),
    )
  })

  // A discovery issuer can name a resource this same stack creates - a Cognito
  // pool in `resources:` - which is only expressible as a CloudFormation
  // intrinsic. The document already renders through `Fn::Sub`, so the intrinsic
  // rides machinery that is already there.
  it.each([
    [
      'an Fn::Sub over the pool this stack creates',
      {
        'Fn::Sub':
          'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}',
      },
    ],
    ['a Ref', { Ref: 'IssuerParameter' }],
    ['an Fn::GetAtt', { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] }],
    ['an Fn::ImportValue', { 'Fn::ImportValue': 'shared-issuer' }],
    [
      'an Fn::Sub in its list form',
      { 'Fn::Sub': ['https://${Host}/', { Host: { Ref: 'IssuerHost' } }] },
    ],
  ])('accepts an oauthDiscovery issuer that is %s', (_label, issuer) => {
    const { servers } = validateMcp({
      mcp: {
        servers: {
          crm: { server: 'src/server.mjs', oauthDiscovery: { issuer } },
        },
      },
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    // Handed on exactly as written: CloudFormation is the only thing entitled
    // to interpret it.
    expect(servers[0].oauthDiscovery).toEqual({ issuer })
    expect(servers[0].oauthDiscovery.issuer).toBe(issuer)
  })

  // An object that is not an intrinsic is not an issuer either - it lands on
  // the same teaching error a number or a blank string does.
  it.each([
    ['a plain object', { host: 'acme.auth0.com' }],
    ['two intrinsic keys', { Ref: 'A', 'Fn::Sub': 'https://b' }],
    ['an unknown pseudo-intrinsic', { 'Fn::Nope': 'x' }],
    ['an intrinsic outside the accepted set', { 'Fn::Select': [0, ['a']] }],
    ['an empty object', {}],
  ])('rejects an oauthDiscovery issuer that is %s', (_label, issuer) => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: { server: 'src/server.mjs', oauthDiscovery: { issuer } },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_ISSUER_REQUIRED',
        message: expect.stringContaining(
          'mcp.servers.crm.oauthDiscovery.issuer',
        ),
      }),
    )
  })

  // The literal segments of an `Fn::Sub` template are checked exactly as a
  // literal issuer is; the `${...}` placeholders are CloudFormation's own
  // substitution, resolved long before API Gateway evaluates the document, so
  // they are masked out before the guard runs.
  it.each([
    ['a bare dollar sign', 'https://acme$.auth0.com/${UserPool}'],
    ['a hash', 'https://acme.auth0.com/#${UserPool}'],
    ['a lone dollar sign after the placeholders', 'https://${Host}/$tenant'],
  ])(
    'rejects an Fn::Sub issuer whose literal text contains %s',
    (_label, template) => {
      expect(() =>
        validateMcp({
          mcp: {
            servers: {
              crm: {
                server: 'src/server.mjs',
                oauthDiscovery: { issuer: { 'Fn::Sub': template } },
              },
            },
          },
          functions: {},
          providerRuntime: undefined,
          naming,
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'MCP_OAUTH_DISCOVERY_VTL_UNSAFE_VALUE',
          message: expect.stringContaining(
            'mcp.servers.crm.oauthDiscovery.issuer',
          ),
        }),
      )
    },
  )

  it.each([
    ['http', 'http://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}'],
    ['a scheme built out of a placeholder', '${Scheme}://acme.auth0.com'],
    ['no scheme at all', 'cognito-idp.${AWS::Region}.amazonaws.com'],
  ])(
    'rejects an Fn::Sub issuer that is not https once the placeholders are masked (%s)',
    (_label, template) => {
      expect(() =>
        validateMcp({
          mcp: {
            servers: {
              crm: {
                server: 'src/server.mjs',
                oauthDiscovery: { issuer: { 'Fn::Sub': template } },
              },
            },
          },
          functions: {},
          providerRuntime: undefined,
          naming,
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'MCP_OAUTH_DISCOVERY_ISSUER_NOT_HTTPS',
          message: expect.stringContaining(
            'mcp.servers.crm.oauthDiscovery.issuer',
          ),
        }),
      )
    },
  )

  // An object that is not an intrinsic was never "no issuer" - the message has
  // to quote what was written and name what an intrinsic issuer may be, rather
  // than describe an omission the user did not make.
  it('quotes an unrecognized object issuer and names the intrinsics it accepts', () => {
    let message
    try {
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              oauthDiscovery: { issuer: { 'Fn::Nope': 'x' } },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      })
    } catch (error) {
      message = error.message
    }
    expect(message).toContain('"Fn::Nope"')
    expect(message).not.toContain('without an issuer')
    for (const intrinsic of [
      'Ref',
      'Fn::GetAtt',
      'Fn::Sub',
      'Fn::ImportValue',
    ]) {
      expect(message).toContain(intrinsic)
    }
  })

  // "${!Name}" is CloudFormation's escape for a LITERAL "${Name}": it is not a
  // substitution, so masking it away would hide a "$" that reaches Velocity in
  // the published document.
  it("rejects an Fn::Sub issuer using CloudFormation's literal escape", () => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              oauthDiscovery: {
                issuer: { 'Fn::Sub': 'https://acme.auth0.com/${!Tenant}' },
              },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_VTL_UNSAFE_VALUE',
        message: expect.stringContaining(
          'mcp.servers.crm.oauthDiscovery.issuer',
        ),
      }),
    )
  })

  // The whole URL held in one parameter cannot have a scheme written around it,
  // so the message has to name the shape that does work.
  it('points a whole-URL Fn::Sub issuer at the Ref form', () => {
    let message
    try {
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              oauthDiscovery: { issuer: { 'Fn::Sub': '${IssuerUrl}' } },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      })
    } catch (error) {
      message = error.message
    }
    expect(message).toContain('Ref')
    expect(message).toContain('mcp.servers.crm.oauthDiscovery.issuer')
  })

  // A host written as a placeholder is a legal shape: the guard runs on the
  // literal segments, and "https://" is one of them.
  it('accepts an Fn::Sub issuer whose host is a placeholder', () => {
    const issuer = { 'Fn::Sub': 'https://${IssuerHost}/oauth2' }
    const { servers } = validateMcp({
      mcp: {
        servers: {
          crm: { server: 'src/server.mjs', oauthDiscovery: { issuer } },
        },
      },
      functions: {},
      providerRuntime: undefined,
      naming,
    })
    expect(servers[0].oauthDiscovery.issuer).toBe(issuer)
  })

  it('says why a Velocity-active character is rejected', () => {
    expect(() =>
      validateMcp({
        mcp: {
          servers: {
            crm: {
              server: 'src/server.mjs',
              oauthDiscovery: { issuer: 'https://acme.auth0.com/$tenant' },
            },
          },
        },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(/discovery document/i)
  })
})
