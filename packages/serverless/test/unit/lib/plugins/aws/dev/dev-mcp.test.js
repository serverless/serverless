import { jest } from '@jest/globals'

// One logger per namespace, kept rather than freshly built per call: the plugin
// binds `log.get('sls:dev')` once at module scope, so a factory returning a new
// double each time would leave the test asserting against an object nothing
// ever wrote to.
const loggers = new Map()
const getLogger = (namespace) => {
  if (!loggers.has(namespace)) {
    loggers.set(namespace, {
      logoDevMode: jest.fn(),
      blankLine: jest.fn(),
      aside: jest.fn(),
      notice: jest.fn(),
      debug: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
    })
  }
  return loggers.get(namespace)
}

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    get: jest.fn(getLogger),
    error: jest.fn(),
    blankLine: jest.fn(),
    warning: jest.fn(),
    notice: jest.fn(),
  },
  progress: {
    get: jest.fn(() => ({
      notice: jest.fn(),
      remove: jest.fn(),
    })),
  },
  style: { aside: jest.fn((m) => m) },
  stringToSafeColor: jest.fn((v) => v),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options = {}) {
      super(message)
      this.code = code
      this.options = options
    }
  },
}))

jest.unstable_mockModule('aws-iot-device-sdk', () => ({ default: {} }))
jest.unstable_mockModule('chokidar', () => ({
  default: { watch: jest.fn(() => ({ on: jest.fn() })) },
}))

const { default: AwsDev } =
  await import('../../../../../../lib/plugins/aws/dev/index.js')

const { shouldWarnEdgeFirstByteBudget } =
  await import('../../../../../../lib/plugins/aws/mcp/lib/endpoint-type.js')

// `mcpServers` stands in for the mcp plugin's validated registry - the
// instance member the dev plugin locates by shape, exactly as it would at
// runtime after the mcp plugin's `initialize` hook.
function buildPlugin({ functions = {}, mcpServers = [], plugins = [] }) {
  const provider = {
    getStage: () => 'dev',
    request: async () => ({ endpointAddress: 'x' }),
  }

  const serverless = {
    processedInput: { commands: ['dev'], options: {} },
    configurationInput: {},
    service: {
      provider: { runtime: 'nodejs20.x' },
      functions,
      getServiceName: () => 'svc',
      getAllFunctions: () => Object.keys(functions),
      getFunction: (name) => functions[name],
    },
    classes: { Error },
    getProvider: () => provider,
    pluginManager: {
      plugins: [{ validated: { servers: mcpServers } }, ...plugins],
    },
  }

  return { plugin: new AwsDev(serverless, {}), serverless }
}

const crmServer = { name: 'crm', server: 'src/server.mjs' }

test('update() selects index.streamHandler for MCP functions only', async () => {
  const { plugin, serverless } = buildPlugin({
    functions: {
      crm: { handler: 'src/server.default' },
      plain: { handler: 'handler.hello' },
    },
    mcpServers: [crmServer],
  })

  await plugin.update()

  expect(serverless.service.functions.crm.handler).toBe('index.streamHandler')
  expect(serverless.service.functions.plain.handler).toBe('index.handler')
})

// A function config key is a public surface: a plain function carrying one
// (a custom plugin's metadata, an unknown property kept under
// `configValidationMode: warn`) is still a plain function. Only the mcp
// plugin's own registry says which functions are MCP servers.
test('update() does not reroute a plain function that carries a stray mcpServer key', async () => {
  const { plugin, serverless } = buildPlugin({
    functions: {
      plain: { handler: 'handler.hello', mcpServer: { module: 'x.mjs' } },
    },
    mcpServers: [],
  })

  await plugin.update()

  expect(serverless.service.functions.plain.handler).toBe('index.handler')
  expect(plugin.isMcpFunction('plain')).toBe(false)
})

test('isMcpFunction is false without an mcp plugin in the plugin list', () => {
  const { plugin, serverless } = buildPlugin({
    functions: { crm: { handler: 'src/server.default' } },
  })
  serverless.pluginManager = { plugins: [{}] }
  expect(plugin.isMcpFunction('crm')).toBe(false)
  delete serverless.pluginManager
  expect(plugin.isMcpFunction('crm')).toBe(false)
})

// The section the mcp plugin contributes reaches dev mode through
// `addServiceOutputSection`, which writes to `servicePluginOutputs` and never to
// `serviceOutputs` (lib/serverless.js) - the map the info plugin's own display
// steps write directly. Reading the wrong one prints the rest of the summary
// and silently drops the MCP endpoints, which is what a live dev session did.
test('logOutputs prints the MCP section the mcp plugin contributed', () => {
  const { plugin, serverless } = buildPlugin({ functions: {} })
  const endpoint = 'https://abc.execute-api.us-east-1.amazonaws.com/dev/crm/mcp'
  serverless.serviceOutputs = new Map([['functions', ['crm: svc-dev-crm']]])
  serverless.servicePluginOutputs = new Map([['mcp', `crm → ${endpoint}`]])
  const devLogger = getLogger('sls:dev')
  devLogger.aside.mockClear()

  plugin.logOutputs()

  const printed = devLogger.aside.mock.calls.map(([line]) => line).join('\n')
  expect(printed).toContain('Functions:')
  // Same label and shape as `deploy` and `info` print for this section: one
  // server inline, several as an indented block.
  expect(printed).toContain(`mcp: crm → ${endpoint}`)
  expect(printed).not.toContain('MCP servers')
})

test('logOutputs prints several MCP servers as an indented mcp: block', () => {
  const { plugin, serverless } = buildPlugin({ functions: {} })
  serverless.serviceOutputs = new Map()
  serverless.servicePluginOutputs = new Map([
    ['mcp', ['crm → https://a/crm/mcp', 'billing → https://a/billing/mcp']],
  ])
  const devLogger = getLogger('sls:dev')
  devLogger.aside.mockClear()

  plugin.logOutputs()

  const printed = devLogger.aside.mock.calls.map(([line]) => line).join('\n')
  expect(printed).toContain(
    'mcp:\n  crm → https://a/crm/mcp\n  billing → https://a/billing/mcp',
  )
})

// Every MCP request is a POST to the same path, so the generic API Gateway
// label cannot tell one call from the next; the JSON-RPC method can.
describe('MCP invocation log lines', () => {
  const functions = {
    crm: { handler: 'src/server.default' },
    plain: { handler: 'handler.hello' },
  }
  const mcpServers = [crmServer]
  const restEvent = (body, path = '/crm/mcp') => ({
    httpMethod: 'POST',
    path,
    headers: { 'content-type': 'application/json' },
    requestContext: { stage: 'dev' },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  })
  const printedBy = (devLogger) =>
    devLogger.aside.mock.calls.map(([line]) => line).join('\n')

  test('request line names the JSON-RPC call for an MCP function', () => {
    const { plugin } = buildPlugin({ functions, mcpServers })
    const devLogger = getLogger('sls:dev')
    devLogger.aside.mockClear()

    plugin.logFunctionEvent(
      'crm',
      restEvent({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'echo', arguments: {} },
      }),
      false,
      (s) => s,
    )

    expect(printedBy(devLogger)).toBe('→ λ crm ── mcp tools/call echo')
  })

  test('request line keeps the API Gateway label for a plain function', () => {
    const { plugin } = buildPlugin({ functions, mcpServers })
    const devLogger = getLogger('sls:dev')
    devLogger.aside.mockClear()

    plugin.logFunctionEvent(
      'plain',
      restEvent({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, '/hello'),
      false,
      (s) => s,
    )

    expect(printedBy(devLogger)).toBe(
      '→ λ plain ── aws:apigateway:v1:post:/hello',
    )
  })

  test('request line falls back to the API Gateway label when the body is not JSON-RPC', () => {
    const { plugin } = buildPlugin({ functions, mcpServers })
    const devLogger = getLogger('sls:dev')
    devLogger.aside.mockClear()

    plugin.logFunctionEvent(
      'crm',
      { ...restEvent({}), body: 'garbage' },
      false,
      (s) => s,
    )

    expect(printedBy(devLogger)).toBe(
      '→ λ crm ── aws:apigateway:v1:post:/crm/mcp',
    )
  })

  test('response line carries the local run time for an MCP function', () => {
    const { plugin } = buildPlugin({ functions, mcpServers })
    const devLogger = getLogger('sls:dev')
    devLogger.aside.mockClear()

    plugin.logFunctionResponse(
      'crm',
      { statusCode: 200, body: '{"jsonrpc":"2.0","id":1,"result":{}}' },
      false,
      (s) => s,
      { executionTimeInMs: 1527 },
    )

    expect(printedBy(devLogger)).toBe('← λ crm (200) 1.5s')
  })

  test('response line surfaces a JSON-RPC error hidden behind a 200', () => {
    const { plugin } = buildPlugin({ functions, mcpServers })
    const devLogger = getLogger('sls:dev')
    devLogger.aside.mockClear()

    plugin.logFunctionResponse(
      'crm',
      {
        statusCode: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32602, message: 'Invalid params' },
        }),
      },
      false,
      (s) => s,
      { executionTimeInMs: 420 },
    )

    expect(printedBy(devLogger)).toBe(
      '← λ crm (200) 420ms ── error -32602: Invalid params',
    )
  })

  test('response line for a plain function is unchanged', () => {
    const { plugin } = buildPlugin({ functions, mcpServers })
    const devLogger = getLogger('sls:dev')
    devLogger.aside.mockClear()

    plugin.logFunctionResponse(
      'plain',
      { statusCode: 200, body: '{"jsonrpc":"2.0","id":1,"error":{"code":1}}' },
      false,
      (s) => s,
      { executionTimeInMs: 1527 },
    )

    expect(printedBy(devLogger)).toBe('← λ plain (200)')
  })
})

// Production packaging rewrites SERVERLESS_MCP_SERVER_MODULE to the file the
// artifact actually contains; dev mode never packages, so the local child would
// otherwise receive the configured source path and fall back to the entry's
// extension probe - which a leftover from an earlier build (say a `.mjs` from
// before an `outExtension` change, next to the fresh `.js`) can win, silently
// serving stale code. The dev plugin now names the emitted file the same way.
describe('localMcpEnvironment', () => {
  const buildDir = '/svc/.serverless/build'
  const esbuildLike = (extension) => ({
    functions: async () => ({ crm: {} }),
    _buildProperties: async () => ({}),
    _outputExtension: () => extension,
  })
  const setup = ({ built = true, extension = '.js', esbuild = true } = {}) => {
    const functions = {
      crm: {
        // What dev's `update()` leaves behind: the swapped shim handler plus
        // the preserved original the build plugins work from.
        handler: 'index.streamHandler',
        originalHandler: 'src/server.default',
      },
      plain: { handler: 'index.handler', originalHandler: 'handler.hello' },
    }
    const { plugin, serverless } = buildPlugin({
      functions,
      mcpServers: [crmServer],
      plugins: esbuild ? [{}, esbuildLike(extension)] : [{}],
    })
    serverless.builtFunctions = new Set(built ? ['crm', 'plain'] : [])
    return { plugin, functions }
  }
  const forwarded = {
    SERVERLESS_MCP_SERVER_MODULE: 'src/server.mjs',
    LAMBDA_TASK_ROOT: '/var/task',
    OTHER: 'kept',
  }

  test('names the emitted file for a bundled MCP function', async () => {
    const { plugin, functions } = setup({ extension: '.js' })
    const env = await plugin.localMcpEnvironment({
      functionName: 'crm',
      functionConfig: functions.crm,
      environment: forwarded,
      serviceAbsolutePath: buildDir,
    })
    expect(env).toEqual({
      SERVERLESS_MCP_SERVER_MODULE: 'src/server.js',
      LAMBDA_TASK_ROOT: buildDir,
      OTHER: 'kept',
    })
    expect(forwarded.SERVERLESS_MCP_SERVER_MODULE).toBe('src/server.mjs')
  })

  test('follows the configured outExtension', async () => {
    const { plugin, functions } = setup({ extension: '.mjs' })
    const env = await plugin.localMcpEnvironment({
      functionName: 'crm',
      functionConfig: functions.crm,
      environment: forwarded,
      serviceAbsolutePath: buildDir,
    })
    expect(env.SERVERLESS_MCP_SERVER_MODULE).toBe('src/server.mjs')
  })

  test('leaves the configured path alone in classic mode', async () => {
    const { plugin, functions } = setup({ built: false })
    const env = await plugin.localMcpEnvironment({
      functionName: 'crm',
      functionConfig: functions.crm,
      environment: forwarded,
      serviceAbsolutePath: '/svc',
    })
    expect(env).toEqual({ ...forwarded, LAMBDA_TASK_ROOT: '/svc' })
  })

  test('leaves the configured path alone when no bundler plugin is loaded', async () => {
    const { plugin, functions } = setup({ esbuild: false })
    const env = await plugin.localMcpEnvironment({
      functionName: 'crm',
      functionConfig: functions.crm,
      environment: forwarded,
      serviceAbsolutePath: buildDir,
    })
    expect(env.SERVERLESS_MCP_SERVER_MODULE).toBe('src/server.mjs')
    expect(env.LAMBDA_TASK_ROOT).toBe(buildDir)
  })

  test('returns a plain function environment untouched', async () => {
    const { plugin, functions } = setup()
    const env = await plugin.localMcpEnvironment({
      functionName: 'plain',
      functionConfig: functions.plain,
      environment: forwarded,
      serviceAbsolutePath: buildDir,
    })
    expect(env).toBe(forwarded)
  })
})

test('getEventLog labels SNS events aws:sns', () => {
  const { plugin } = buildPlugin({})

  const line = plugin.getEventLog({
    Records: [
      {
        EventSource: 'aws:sns',
        Sns: { TopicArn: 'arn:aws:sns:us-east-1:1:topic', MessageId: 'm1' },
      },
    ],
  })

  expect(line).toContain('aws:sns:topic')
})

// The ~29 s first-byte budget belongs to CloudFront, so the warning about it
// belongs to the endpoints CloudFront fronts. A regional or private endpoint
// carries the integration timeout instead - a live 35 s tool call returns 200
// through a dev session on `endpointType: REGIONAL` - and the generic
// configured-timeout warning already owns that bound.
describe('shouldWarnEdgeFirstByteBudget', () => {
  test('warns on the edge-optimized default the provider leaves unset', () => {
    expect(
      shouldWarnEdgeFirstByteBudget({
        provider: { runtime: 'nodejs20.x' },
        executionTimeInMs: 29001,
      }),
    ).toBe(true)
  })

  test.each(['EDGE', 'edge', 'Edge'])('warns on an explicit %s', (value) => {
    expect(
      shouldWarnEdgeFirstByteBudget({
        provider: { endpointType: value },
        executionTimeInMs: 35000,
      }),
    ).toBe(true)
  })

  test.each(['REGIONAL', 'regional', 'PRIVATE', 'private'])(
    'stays silent on %s',
    (value) => {
      expect(
        shouldWarnEdgeFirstByteBudget({
          provider: { endpointType: value },
          executionTimeInMs: 35000,
        }),
      ).toBe(false)
    },
  )

  test.each([29000, 1200, 0])(
    'stays silent at %sms, inside the budget',
    (executionTimeInMs) => {
      expect(
        shouldWarnEdgeFirstByteBudget({ provider: {}, executionTimeInMs }),
      ).toBe(false)
    },
  )

  // An endpoint type the resolver cannot place is treated as edge: an
  // over-eager warning costs a line of output, a missing one costs a dropped
  // response the user has to rediscover.
  test.each([
    ['an unrecognized value', { endpointType: 'ORBITAL' }],
    ['a non-string value', { endpointType: 42 }],
    ['no provider at all', undefined],
  ])('warns on %s', (_label, provider) => {
    expect(
      shouldWarnEdgeFirstByteBudget({ provider, executionTimeInMs: 35000 }),
    ).toBe(true)
  })
})
