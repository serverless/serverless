/**
 * Serverless Framework Default Command Schema.
 * In earlier versions of the Framework, there were multiple schemas
 * for providers and being in or outside of a Service.
 * In V.4 we have a single schema for all commands, since
 * we only support the AWS provider.
 */

import globalOptions from './commands-options-schema.js'

const commands = new Map()
commands.commonOptions = globalOptions

// Export the commands Map and any other properties collectively
export default commands

commands.set('print', {
  usage: 'Print your compiled and resolved config file',
  hasAwsExtension: true,
  options: {
    format: {
      type: 'string',
      usage:
        'Print configuration in given format ("yaml", "json", "text"). Default: yaml',
    },
    path: {
      type: 'string',
      usage:
        'Optional period-separated path to print a sub-value (eg: "provider.name")',
    },
    transform: {
      type: 'string',
      usage: 'Optional transform-function to apply to the value ("keys")',
    },
  },
  lifecycleEvents: ['print'],
  serviceDependencyMode: 'required',
})

commands.set('help', {
  usage: 'Display Help',
  options: {},
  serviceDependencyMode: 'optional',
})

commands.set('package', {
  usage: 'Packages a Serverless Service',
  hasAwsExtension: true,
  options: {
    package: {
      type: 'string',
      usage: 'Output path for the package',
      shortcut: 'p',
    },
    'minify-template': {
      usage: 'Minify the AWS CloudFormation template for AWS packages',
      type: 'boolean',
    },
  },
  lifecycleEvents: [
    'cleanup',
    'initialize',
    'setupProviderConfiguration',
    'createDeploymentArtifacts',
    'compileLayers',
    'compileFunctions',
    'compileEvents',
    'finalize',
  ],
  serviceDependencyMode: 'required',
})

commands.set('deploy', {
  groupName: 'main',
  usage: 'Deploy a Serverless service',
  options: {
    conceal: {
      usage: 'Hide secrets from the output (e.g. API Gateway key values)',
      type: 'boolean',
    },
    package: {
      type: 'string',
      usage: 'Path of the deployment package',
      shortcut: 'p',
    },
    force: {
      usage: 'Forces a deployment to take place',
      type: 'boolean',
    },
    'aws-s3-accelerate': {
      usage:
        'Enables S3 Transfer Acceleration making uploading artifacts much faster.',
      type: 'boolean',
    },
    'minify-template': {
      usage: 'Minify the CloudFormation template',
      type: 'boolean',
    },
    'enforce-hash-update': {
      usage:
        'Enforces new function version by overriding descriptions across all your functions. To be used only when migrating to new hashing algorithm.',
      type: 'boolean',
    },
    'enable-legacy-deployment-bucket': {
      usage:
        'Use a deployment bucket created and managed by the service stack, instead of the global deployment bucket.',
      type: 'boolean',
    },
    stack: {
      usage: 'CloudFormation/SAM Only. Set the stack name.',
      type: 'string',
    },
    bucket: {
      usage: 'CloudFormation/SAM Only. Set the bucket name.',
      type: 'string',
    },
  },
  lifecycleEvents: ['deploy', 'finalize'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('deploy function', {
  groupName: 'main',
  usage: 'Deploy a single function from the service',
  options: {
    function: {
      type: 'string',
      usage: 'Name of the function',
      shortcut: 'f',
      required: true,
    },
    force: {
      usage: 'Forces a deployment to take place',
      type: 'boolean',
    },
    'update-config': {
      usage:
        'Updates function configuration, e.g. Timeout or Memory Size without deploying code',
      shortcut: 'u',
      type: 'boolean',
    },
  },
  lifecycleEvents: ['initialize', 'packageFunction', 'deploy'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('deploy list', {
  usage: 'List deployed version of your Serverless Service',
  options: {},
  lifecycleEvents: ['log'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('deploy list functions', {
  usage: 'List all the deployed functions and their versions',
  options: {},
  lifecycleEvents: ['log'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('info', {
  groupName: 'main',
  usage: 'Display information about the service',
  options: {
    stage: {
      usage: 'The service stage to get info on.',
      type: 'string',
    },
    region: {
      usage: 'The service region to get info on.',
      type: 'string',
    },
    conceal: {
      usage: 'Hide secrets from the output (e.g. API Gateway key values)',
      type: 'boolean',
    },
    json: {
      usage: 'Output the information in JSON format',
      type: 'boolean',
    },
    stack: {
      usage: 'CloudFormation/SAM Only. Set the stack name.',
      type: 'string',
    },
  },
  lifecycleEvents: ['info'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('dev', {
  groupName: 'main',
  usage: 'Start dev mode in this service',
  options: {
    stage: {
      usage: 'The service stage where you want to start your dev mode.',
      type: 'string',
    },
    region: {
      usage: 'The region where you want to start your dev mode.',
      type: 'string',
    },
    detailed: {
      usage: 'Show complete invocation events and responses',
      type: 'boolean',
    },
    mode: {
      usage:
        'Dev mode type: "functions" (default) or "agents" (for AgentCore runtimes). Auto-detected if not specified.',
      shortcut: 'm',
      type: 'string',
    },
    agent: {
      usage:
        'Name of the agent to run in agents dev mode (defaults to first runtime agent)',
      shortcut: 'a',
      type: 'string',
    },
    port: {
      usage: 'Port to expose the agent container on (default: 8080)',
      shortcut: 'p',
      type: 'string',
    },
    'on-exit': {
      usage:
        'What to do when exiting dev mode. Allowed value: "remove" (with confirmation)',
      type: 'string',
    },
  },
  lifecycleEvents: ['dev'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('offline', {
  groupName: 'main',
  usage:
    'Run your Lambda handlers locally behind API Gateway (HTTP API, REST), ALB, WebSocket, and Schedule event sources, with a local Lambda Invoke endpoint.',
  options: {
    albPort: {
      usage: 'ALB server port (default 3003)',
      type: 'string',
    },
    corsAllowHeaders: {
      usage:
        'Used to build the Access-Control-Allow-Headers header for CORS support',
      type: 'string',
    },
    corsAllowOrigin: {
      usage:
        'Used to build the Access-Control-Allow-Origin header for CORS support',
      type: 'string',
    },
    corsDisallowCredentials: {
      usage:
        'Used to override the Access-Control-Allow-Credentials default to false',
      type: 'boolean',
    },
    corsExposedHeaders: {
      usage:
        'Used to build the Access-Control-Expose-Headers response header for CORS support',
      type: 'string',
    },
    disableCookieValidation: {
      usage: 'Disable cookie validation on the local Hapi server',
      type: 'boolean',
    },
    dockerHost: {
      usage:
        'Host name that Docker containers use to reach the offline host (default host.docker.internal)',
      type: 'string',
    },
    dockerHostServicePath: {
      usage:
        'Service path as seen by Serverless when it runs inside a Docker container',
      type: 'string',
    },
    dockerNetwork: {
      usage: 'Docker network that Lambda containers connect to',
      type: 'string',
    },
    dockerReadOnly: {
      usage: 'Mount Docker code layers read-only (default true)',
      type: 'boolean',
    },
    enforceSecureCookies: {
      usage: 'Enforce secure cookies in local REST responses',
      type: 'boolean',
    },
    host: {
      usage: 'Host the local servers bind to (default localhost)',
      type: 'string',
    },
    httpPort: {
      usage: 'HTTP server port — REST + HTTP API (default 3000)',
      type: 'string',
    },
    httpsProtocol: {
      usage:
        'Enable HTTPS by specifying a directory containing cert.pem and key.pem',
      type: 'string',
    },
    ignoreJWTSignature: {
      usage:
        'When using HTTP API JWT authorizers, skip JWT signature verification',
      type: 'boolean',
    },
    lambdaPort: {
      usage: 'Port for the Lambda invoke endpoint (default 3002)',
      type: 'string',
    },
    layersDir: {
      usage:
        'Directory where downloaded Lambda layers are cached (default <service>/.serverless-offline/layers)',
      type: 'string',
    },
    localEnvironment: {
      usage: 'Copy local process environment variables into Lambda handlers',
      type: 'boolean',
    },
    noAuth: {
      usage: 'Turn off all authorizers',
      type: 'boolean',
    },
    noPrependStageInUrl: {
      usage: 'Do NOT prepend the deployment stage to REST API URLs',
      type: 'boolean',
    },
    noSponsor: {
      usage: 'Accepted for serverless-offline compatibility; ignored',
      type: 'boolean',
    },
    noTimeout: {
      usage: 'Disable handler timeout enforcement',
      type: 'boolean',
    },
    noWatch: {
      usage: 'Disable hot-reload of handler files',
      type: 'boolean',
    },
    preLoadModules: {
      usage: 'Accepted for serverless-offline compatibility; ignored',
      type: 'string',
    },
    prefix: {
      usage:
        'Extra path segment to prepend after the stage in REST API URLs (e.g. --prefix api → /<stage>/api/<route>)',
      type: 'string',
    },
    reloadHandler: {
      usage:
        'Reload handlers on change, for serverless-offline compatibility (maps to --watch)',
      type: 'boolean',
    },
    resourceRoutes: {
      usage: 'Accepted for serverless-offline compatibility; ignored',
      type: 'boolean',
    },
    terminateIdleLambdaTime: {
      usage:
        'Number of seconds an idle Lambda runner stays warm before it is terminated. Default: 60.',
      type: 'string',
    },
    useDocker: {
      usage: 'Run supported Lambda handlers in Docker containers',
      type: 'boolean',
    },
    useInProcess: {
      usage:
        'Run Lambda handlers in the offline server process (Node.js only) instead of spawning a worker thread per concurrent invocation. Faster invocation, but handler module state and process.env mutations persist between calls. Default: false.',
      type: 'boolean',
    },
    watch: {
      usage: 'Enable hot-reload of handler files (default true)',
      type: 'boolean',
    },
    webSocketHardTimeout: {
      usage:
        'Set WebSocket hard timeout in seconds to reproduce AWS limits (default 7200)',
      type: 'string',
    },
    webSocketIdleTimeout: {
      usage:
        'Set WebSocket idle timeout in seconds to reproduce AWS limits (default 600)',
      type: 'string',
    },
    websocketPort: {
      usage: 'WebSocket server port (default 3001)',
      type: 'string',
    },
  },
  lifecycleEvents: ['offline'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('invoke', {
  groupName: 'main',
  usage: 'Invoke a deployed function or agent',
  options: {
    function: {
      type: 'string',
      usage: 'The function name',
      shortcut: 'f',
    },
    agent: {
      type: 'string',
      usage: 'The agent name (for AgentCore Runtime agents)',
      shortcut: 'a',
    },
    'session-id': {
      type: 'string',
      usage:
        'Session ID for multi-turn agent conversations (minimum 33 characters)',
      minLength: 33,
    },
    qualifier: {
      type: 'string',
      usage: 'Version number or alias to invoke',
      shortcut: 'q',
    },
    path: {
      type: 'string',
      usage: 'Path to JSON or YAML file holding input data',
      shortcut: 'p',
    },
    type: {
      type: 'string',
      usage: 'Type of invocation',
      shortcut: 't',
    },
    log: {
      usage: 'Trigger logging data output',
      shortcut: 'l',
      type: 'boolean',
    },
    data: {
      type: 'string',
      usage: 'Input data',
      shortcut: 'd',
    },
    raw: {
      usage: 'Flag to pass input data as a raw string',
      type: 'boolean',
    },
    context: {
      type: 'string',
      usage: 'Context of the service',
    },
    contextPath: {
      type: 'string',
      usage: 'Path to JSON or YAML file holding context data',
    },
    'tenant-id': {
      type: 'string',
      usage: 'Tenant ID for the invocation',
    },
    'durable-execution-name': {
      type: 'string',
      usage:
        'Unique name for durable function execution (enables idempotency, 1-64 chars)',
    },
  },
  lifecycleEvents: ['invoke'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('invoke local', {
  usage: 'Invoke function locally',
  options: {
    function: {
      type: 'string',
      usage: 'Name of the function',
      shortcut: 'f',
      required: true,
    },
    path: {
      type: 'string',
      usage: 'Path to JSON or YAML file holding input data',
      shortcut: 'p',
    },
    data: {
      type: 'string',
      usage: 'input data',
      shortcut: 'd',
    },
    raw: {
      usage: 'Flag to pass input data as a raw string',
      type: 'boolean',
    },
    context: {
      type: 'string',
      usage: 'Context of the service',
    },
    contextPath: {
      type: 'string',
      usage: 'Path to JSON or YAML file holding context data',
      shortcut: 'x',
    },
    env: {
      usage:
        'Override environment variables. e.g. --env VAR1=val1 --env VAR2=val2',
      shortcut: 'e',
      type: 'multiple',
    },
    docker: {
      usage: 'Flag to turn on docker use for node/python/ruby/java',
      type: 'boolean',
    },
    'docker-arg': {
      type: 'string',
      usage:
        'Arguments to docker run command. e.g. --docker-arg "-p 9229:9229"',
    },
  },
  lifecycleEvents: ['loadEnvVars', 'invoke'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('logs', {
  groupName: 'main',
  usage: 'Output the logs of a deployed function or agent',
  options: {
    function: {
      type: 'string',
      usage: 'The function name',
      shortcut: 'f',
    },
    agent: {
      type: 'string',
      usage: 'The agent name',
      shortcut: 'a',
    },
    tail: {
      usage: 'Tail the log output',
      shortcut: 't',
      type: 'boolean',
    },
    startTime: {
      type: 'string',
      usage:
        'Logs before this time will not be displayed. Default: `10m` (last 10 minutes logs only)',
    },
    filter: {
      type: 'string',
      usage: 'A filter pattern',
    },
    interval: {
      type: 'string',
      usage: 'Tail polling interval in milliseconds. Default: `1000`',
      shortcut: 'i',
    },
  },
  lifecycleEvents: ['logs'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('metrics', {
  usage: 'Show metrics for a specific function',
  options: {
    function: {
      type: 'string',
      usage: 'The function name',
      shortcut: 'f',
    },
    startTime: {
      type: 'string',
      usage: 'Start time for the metrics retrieval (e.g. 1970-01-01)',
    },
    endTime: {
      type: 'string',
      usage: 'End time for the metrics retrieval (e.g. 1970-01-01)',
    },
  },
  lifecycleEvents: ['metrics'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('remove', {
  usage: 'Remove Serverless service and all resources',
  options: {
    stack: {
      usage: 'CloudFormation/SAM Only. Set the stack name.',
      type: 'string',
    },
    bucket: {
      usage: 'CloudFormation/SAM Only. Set the bucket name.',
      type: 'string',
    },
  },
  lifecycleEvents: ['remove'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('rollback', {
  usage: 'Rollback the Serverless service to a specific deployment',
  options: {
    timestamp: {
      type: 'string',
      usage:
        'Timestamp of the deployment (list deployments with `serverless deploy list`)',
      shortcut: 't',
      required: false,
    },
  },
  lifecycleEvents: ['initialize', 'rollback'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('rollback function', {
  usage: 'Rollback the function to the previous version',
  options: {
    function: {
      type: 'string',
      usage: 'Name of the function',
      shortcut: 'f',
      required: true,
    },
    'function-version': {
      type: 'string',
      usage: 'Version of the function',
      required: true,
    },
  },
  lifecycleEvents: ['rollback'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('prune', {
  usage: 'Clean up deployed functions and/or layers by deleting older versions',
  lifecycleEvents: ['prune'],
  serviceDependencyMode: 'required',
  options: {
    number: {
      usage: 'Number of previous versions to keep',
      shortcut: 'n',
      required: true,
      type: 'string',
    },
    function: {
      usage: 'Function name. Limits cleanup to the specified function',
      shortcut: 'f',
      required: false,
      type: 'string',
    },
    layer: {
      usage: 'Layer name. Limits cleanup to the specified Lambda layer',
      shortcut: 'l',
      required: false,
      type: 'string',
    },
    includeLayers: {
      usage: 'Boolean flag. Includes the pruning of Lambda layers.',
      shortcut: 'i',
      required: false,
      type: 'boolean',
    },
    dryRun: {
      usage:
        'Simulate pruning without executing delete actions. Deletion candidates are logged when used in conjunction with --verbose',
      shortcut: 'd',
      required: false,
      type: 'boolean',
    },
    verbose: {
      usage: 'Enable detailed output',
      required: false,
      type: 'boolean',
    },
  },
})

commands.set('requirements clean', {
  usage: 'Remove .requirements and requirements.zip',
  options: {},
  lifecycleEvents: ['clean'],
  serviceDependencyMode: 'required',
  isHidden: true,
})

commands.set('requirements install', {
  usage: 'Install python requirements manually',
  options: {},
  lifecycleEvents: ['install'],
  serviceDependencyMode: 'required',
  isHidden: true,
})

commands.set('requirements cleanCache', {
  usage: 'Removes all items in the pip download/static cache (if present)',
  options: {},
  lifecycleEvents: ['cleanCache'],
  serviceDependencyMode: 'required',
  isHidden: true,
})
