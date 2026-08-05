import { describe, it, expect } from '@jest/globals'
import { validateMcp } from '../../../../../../lib/plugins/aws/mcp/lib/validate.js'
// The real naming module, threaded in the same way the plugin threads
// `provider.naming` - so the logical ids these collision assertions talk about
// are the ones the provider actually emits.
import naming from '../../../../../../lib/plugins/aws/lib/naming.js'

const base = { servers: { crm: { server: 'src/server.mjs' } } }

describe('validateMcp', () => {
  it('applies defaults: timeout 120, runtime nodejs24.x', () => {
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
        timeout: 120,
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

  it('rejects the reserved server name "well-known"', () => {
    expect(() =>
      validateMcp({
        mcp: { servers: { 'well-known': { server: 'src/server.mjs' } } },
        functions: {},
        providerRuntime: undefined,
        naming,
      }),
    ).toThrow(expect.objectContaining({ code: 'MCP_RESERVED_SERVER_NAME' }))
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
        timeout: 120,
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

  it('passes through memorySize, environment, auth and state', () => {
    const mcp = {
      servers: {
        crm: {
          server: 'src/server.mjs',
          timeout: 300,
          memorySize: 1024,
          environment: { A: 'b' },
          auth: {
            issuer: 'https://acme.auth0.com',
            audiences: ['https://mcp.acme.com'],
          },
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
    expect(servers[0].auth.audiences).toEqual(['https://mcp.acme.com'])
  })
})
