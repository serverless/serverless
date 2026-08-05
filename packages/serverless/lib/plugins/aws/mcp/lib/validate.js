import { ServerlessError } from '@serverless/util'

const MINIMUM_NODE_MAJOR = 20
const DEFAULT_RUNTIME = 'nodejs24.x'
const DEFAULT_TIMEOUT = 60

// Names that cannot be server names, each with why. The API Gateway resource
// logical id normalization folds case, so the lookup below is case-insensitive.
const RESERVED_SERVER_NAMES = new Map([
  [
    'well-known',
    'it would collide with the ".well-known" discovery path that MCP authorization metadata is served from',
  ],
  [
    '__proto__',
    'assigning it onto "functions" would hit the JavaScript prototype setter instead of defining a function',
  ],
])

// A bring-your-own state key is read at runtime with `ssm:GetParameter` or
// `secretsmanager:GetSecretValue`, so only those two services can back it. The
// schema's ARN definition accepts any ARN, hence the check here.
//
// The partition is `[^:]+` rather than `[^:]*` to match `stateIamStatement`,
// which reads the partition back out of the ARN to pick the action: an
// empty-partition ARN accepted here would be built into a statement for the
// wrong service. Region and account stay optional - SSM and Secrets Manager
// ARNs always carry both, but neither is what the action is derived from.
const STATE_ARN_PATTERNS = [
  /^arn:[^:]+:ssm:[^:]*:[^:]*:parameter\/.+/,
  /^arn:[^:]+:secretsmanager:[^:]*:[^:]*:secret:.+/,
]

// The provider schema guarantees the `nodejsNN.x` shape, so an unparsable
// `nodejs*` value is treated as a non-Node runtime rather than a hard error.
const nodeMajorOf = (providerRuntime) => {
  if (typeof providerRuntime !== 'string') return undefined
  const major = providerRuntime.match(/^nodejs(\d+)/)?.[1]
  return major === undefined ? undefined : Number(major)
}

export const validateMcp = ({ mcp, functions, providerRuntime, naming }) => {
  // The transformation the provider applies when turning a function key into
  // its `<Name>LambdaFunction` logical id: distinct identifiers can land on the
  // same one, which would silently overwrite a CloudFormation resource. Taken
  // from the caller's `provider.naming` rather than imported directly, because
  // naming methods are plugin-overridable - importing the module would let this
  // check diverge from the logical ids actually emitted.
  const normalizedNameOf = (name) => naming.getNormalizedFunctionName(name)

  const nodeMajor = nodeMajorOf(providerRuntime)
  if (nodeMajor !== undefined && nodeMajor < MINIMUM_NODE_MAJOR) {
    throw new ServerlessError(
      `MCP servers require a Node.js runtime of nodejs${MINIMUM_NODE_MAJOR}.x or newer (the MCP SDK requires Node.js >= ${MINIMUM_NODE_MAJOR}), but "provider.runtime" is "${providerRuntime}". Set "provider.runtime" to nodejs${MINIMUM_NODE_MAJOR}.x or newer, or remove it to use the default (${DEFAULT_RUNTIME}).`,
      'MCP_UNSUPPORTED_NODE_RUNTIME',
      { stack: false },
    )
  }
  const runtime = nodeMajor === undefined ? DEFAULT_RUNTIME : providerRuntime

  // Keyed by normalized name, so a server colliding with `foo-bar` is caught
  // whether the function is spelled `foo-bar` or `fooDashbar`.
  const functionsByNormalizedName = new Map(
    Object.keys(functions ?? {}).map((key) => [normalizedNameOf(key), key]),
  )
  const serversByNormalizedName = new Map()

  const servers = Object.entries(mcp.servers).map(([name, config]) => {
    const reservedReason = RESERVED_SERVER_NAMES.get(name.toLowerCase())
    if (reservedReason) {
      throw new ServerlessError(
        `MCP server name "${name}" is reserved, because ${reservedReason}. Rename the server.`,
        'MCP_RESERVED_SERVER_NAME',
        { stack: false },
      )
    }
    const normalizedName = normalizedNameOf(name)
    const collidingFunction = functionsByNormalizedName.get(normalizedName)
    if (collidingFunction !== undefined) {
      throw new ServerlessError(
        `MCP server "${name}" collides with the function "${collidingFunction}" defined in "functions": both compile to the CloudFormation logical id "${normalizedName}LambdaFunction". Rename one of them.`,
        'MCP_FUNCTION_NAME_COLLISION',
        { stack: false },
      )
    }
    const collidingServer = serversByNormalizedName.get(normalizedName)
    if (collidingServer !== undefined) {
      throw new ServerlessError(
        `MCP servers "${collidingServer}" and "${name}" collide: both compile to the CloudFormation logical id "${normalizedName}LambdaFunction". Rename one of them.`,
        'MCP_FUNCTION_NAME_COLLISION',
        { stack: false },
      )
    }
    serversByNormalizedName.set(normalizedName, name)
    // Under configValidationMode "warn" (the default) schema violations do not
    // stop the run, so a server entry can arrive here in any shape. A user who
    // wrote a `servers` block means to use MCP servers - a malformed entry
    // gets a teaching error, never a TypeError.
    if (
      config === null ||
      typeof config !== 'object' ||
      Array.isArray(config) ||
      typeof config.server !== 'string' ||
      config.server === ''
    ) {
      throw new ServerlessError(
        `MCP server "${name}" needs "server": the path of the module that default-exports the MCP handler. Set "mcp.servers.${name}.server" to that path (for example "src/server.mjs").`,
        'MCP_SERVER_MODULE_REQUIRED',
        { stack: false },
      )
    }
    if (
      config.state !== undefined &&
      typeof config.state !== 'boolean' &&
      typeof config.state !== 'string'
    ) {
      throw new ServerlessError(
        `MCP server "${name}" sets "state" to a CloudFormation intrinsic. Only a literal ARN string is supported: the ARN's service decides whether the execution role is granted "ssm:GetParameter" or "secretsmanager:GetSecretValue", and an intrinsic hides it. Write the ARN out in full, or set "state: true" to have the Framework provision the key instead.`,
        'MCP_INVALID_STATE_ARN',
        { stack: false },
      )
    }
    if (
      typeof config.state === 'string' &&
      !STATE_ARN_PATTERNS.some((pattern) => pattern.test(config.state))
    ) {
      throw new ServerlessError(
        `MCP server "${name}" sets "state" to "${config.state}", which is not a supported state key ARN. A bring-your-own state key must be either an SSM Parameter Store parameter ("arn:<partition>:ssm:<region>:<account>:parameter/<name>") or a Secrets Manager secret ("arn:<partition>:secretsmanager:<region>:<account>:secret:<name>"). Set "state: true" to have the Framework provision the key instead.`,
        'MCP_INVALID_STATE_ARN',
        { stack: false },
      )
    }
    return {
      name,
      server: config.server,
      auth: config.auth,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      memorySize: config.memorySize,
      environment: config.environment,
      state: config.state,
      runtime,
    }
  })

  return { servers }
}
