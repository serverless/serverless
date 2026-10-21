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

commands.set('diff', {
  groupName: 'main',
  usage:
    'Show the difference between the local template and the deployed CloudFormation stack',
  options: {
    stage: {
      usage: 'The service stage to diff against.',
      type: 'string',
    },
    region: {
      usage: 'The service region to diff against.',
      type: 'string',
    },
    stack: {
      usage: 'CloudFormation/SAM Only. Set the stack name.',
      type: 'string',
    },
    package: {
      usage:
        'Path to an existing package directory to diff against. Skips the auto-package step when set.',
      type: 'string',
      shortcut: 'p',
    },
    json: {
      usage: 'Output the diff in JSON format',
      type: 'boolean',
    },
  },
  lifecycleEvents: ['diff'],
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
        'Dev mode type: "functions" (default), "agents" (AgentCore runtimes), or "sandboxes" (AWS Lambda MicroVMs). Auto-detected if not specified.',
      shortcut: 'm',
      type: 'string',
    },
    agent: {
      usage:
        'Name of the agent to run in agents dev mode (defaults to first runtime agent)',
      shortcut: 'a',
      type: 'string',
    },
    sandbox: {
      type: 'string',
      usage:
        'The sandbox name to run in sandboxes dev mode (AWS Lambda MicroVMs)',
    },
    'assume-role': {
      type: 'boolean',
      usage:
        'Run the sandbox dev container as its execution role (default). Use --no-assume-role to run with your ambient AWS credentials.',
    },
    port: {
      usage:
        'Local dev-mode port: the AgentCore container (agents, default 8080), or the local MicroVMs API control-plane endpoint (sandboxes, default 9100)',
      shortcut: 'p',
      type: 'string',
    },
    function: {
      usage:
        'Attach only this function (repeatable); the others run their deployed code',
      shortcut: 'f',
      type: 'multiple',
    },
    'skip-function': {
      usage: 'Keep this function on its deployed code (repeatable)',
      type: 'multiple',
    },
    'take-over': {
      usage: 'Also attach functions that are in Dev Mode for another developer',
      type: 'boolean',
    },
    approve: {
      usage: 'Ask for confirmation before changing any function',
      type: 'boolean',
    },
    'on-exit': {
      usage:
        'What to do on exit instead of restoring: "keep" leaves functions in Dev Mode, "remove" restores and then removes the service (with confirmation)',
      type: 'string',
    },
    json: {
      usage:
        'With --detach or --dry-run: print one JSON result on stdout (text goes to stderr)',
      type: 'boolean',
    },
    'dry-run': {
      usage:
        'Check everything and print the changes Dev Mode would make, without changing anything',
      type: 'boolean',
    },
    detach: {
      usage:
        'Start the session in the background and return once it is ready (for scripts and AI agents); "serverless dev stop" ends it',
      type: 'boolean',
    },
    'idle-timeout': {
      usage:
        'With --detach: stop and restore after this long without activity, such as 30m (default 60m; 0 never)',
      type: 'string',
    },
    'session-process': {
      usage: 'Internal: used by --detach',
      type: 'boolean',
    },
    keys: {
      usage:
        'Single-key commands while Dev Mode runs in a terminal (on by default); --no-keys turns them off',
      type: 'boolean',
    },
  },
  lifecycleEvents: ['dev'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('dev restore', {
  usage:
    'Remove Dev Mode configuration from the functions of a stage (left by a session that did not exit cleanly, or by --on-exit keep)',
  options: {
    function: {
      usage: 'Only this function (repeatable)',
      shortcut: 'f',
      type: 'multiple',
    },
    json: {
      usage: 'Print one JSON result on stdout (text goes to stderr)',
      type: 'boolean',
    },
  },
  lifecycleEvents: ['restore'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('dev setup', {
  usage:
    'Create the IAM role Dev Mode uses in this AWS account and region (for accounts where developers cannot create IAM roles)',
  options: {
    'permissions-boundary': {
      usage: 'ARN of a permissions boundary policy to attach to the role',
      type: 'string',
    },
    path: {
      usage: 'IAM path for the role, for example "/serverless/" (default "/")',
      type: 'string',
    },
  },
  lifecycleEvents: ['setup'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('dev status', {
  usage:
    'Show whether Dev Mode is on in this service directory: its functions, invocations and endpoints',
  options: {
    json: {
      usage: 'Print one JSON result on stdout (text goes to stderr)',
      type: 'boolean',
    },
  },
  lifecycleEvents: ['status'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('dev stop', {
  usage:
    'Stop the Dev Mode session running in this service directory and restore its functions',
  options: {
    keep: {
      usage: 'Leave the functions in Dev Mode (as "--on-exit keep" does)',
      type: 'boolean',
    },
    timeout: {
      usage:
        'How long to wait for the restore, for example 90s or 10m (default 7m)',
      type: 'string',
    },
    json: {
      usage: 'Print one JSON result on stdout (text goes to stderr)',
      type: 'boolean',
    },
  },
  lifecycleEvents: ['stop'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('dev wait', {
  usage:
    'Wait until the Dev Mode session in this directory is ready, runs an invocation, reloads or ends, then print that event',
  options: {
    for: {
      usage: 'What to wait for: "ready", "invocation", "reload" or "ended"',
      type: 'string',
    },
    function: {
      usage: 'Only an invocation or reload of this function (repeatable)',
      shortcut: 'f',
      type: 'multiple',
    },
    after: {
      usage:
        'Only events after this cursor (from a --json result), including ones that already happened; with --for ready or ended, a state already reached returns its earlier record',
      type: 'string',
    },
    timeout: {
      usage:
        'How long to wait, such as 100s, 5m or 1h (default 100s, at most 1h)',
      type: 'string',
    },
    json: {
      usage: 'Print one JSON result on stdout (text goes to stderr)',
      type: 'boolean',
    },
  },
  lifecycleEvents: ['wait'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('dev requests', {
  usage:
    'List the latest invocations Dev Mode ran on this machine, newest first, with the file that holds each one',
  options: {
    function: {
      usage: 'Only this function (repeatable)',
      shortcut: 'f',
      type: 'multiple',
    },
    limit: {
      usage: 'How many to list (default 20, at most 500)',
      type: 'string',
    },
    json: {
      usage: 'Print one JSON result on stdout (text goes to stderr)',
      type: 'boolean',
    },
  },
  lifecycleEvents: ['requests'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('dev replay', {
  usage:
    'Run a recorded invocation again on this machine through the running session; no caller receives the result',
  positionals: {
    requestId: {
      usage:
        'The request id, or its first 8 or more characters (see "serverless dev requests")',
      required: true,
    },
  },
  options: {
    json: {
      usage: 'Print one JSON result on stdout (text goes to stderr)',
      type: 'boolean',
    },
  },
  lifecycleEvents: ['replay'],
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
    sandbox: {
      type: 'string',
      usage: 'The sandbox name (for AWS Lambda MicroVMs)',
    },
    'web-app': {
      type: 'string',
      usage: 'The web app name (for AWS Lambda Web Functions)',
    },
    method: {
      type: 'string',
      usage: 'HTTP method for a sandbox or web app invoke (default: GET)',
    },
    port: {
      type: 'string',
      usage: 'Sandbox container port to target (default: 8080)',
    },
    header: {
      type: 'multiple',
      usage:
        "HTTP request header for a sandbox or web app invoke, as 'Name: value' (repeatable)",
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
      usage:
        "For --function: path to a JSON/YAML input-data file. For --sandbox and --web-app: the HTTP request path (default '/')",
      shortcut: 'p',
    },
    type: {
      type: 'string',
      usage: 'Type of invocation',
      shortcut: 't',
    },
    log: {
      usage:
        "Trigger logging data output. For --web-app: print the request's log lines",
      shortcut: 'l',
      type: 'boolean',
    },
    data: {
      type: 'string',
      usage: 'Input data. For --sandbox and --web-app: the HTTP request body',
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
    sandbox: {
      type: 'string',
      usage: 'The sandbox name (for AWS Lambda MicroVMs)',
    },
    'web-app': {
      type: 'string',
      usage: 'The web app name (for AWS Lambda Web Functions)',
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

const agentInspectOptions = {}
for (const flag of [
  'functions',
  'api',
  'events',
  'iam',
  'storage',
  'observability',
  'cdn',
  'identity',
  'iot',
  'sandboxes',
  'web-apps',
]) {
  agentInspectOptions[flag] = {
    type: 'boolean',
    usage: `Expand ${flag} resources`,
  }
}
commands.set('agent inspect', {
  usage:
    'Inspect a deployed service: a cheap resource index, or the raw AWS state of selected resources',
  options: {
    ...agentInspectOptions,
    all: { type: 'boolean', usage: 'Expand every category' },
    'aws-services': {
      type: 'string',
      usage:
        'Comma-separated AWS service tokens to expand (e.g. "lambda,iam,s3")',
    },
    name: {
      type: 'multiple',
      usage:
        'Logical ID to scope to (repeatable; used alone auto-selects that resource)',
    },
    format: {
      type: 'string',
      usage: 'Output format: "json" (default) or "yaml"',
      default: 'json',
    },
  },
  lifecycleEvents: ['inspect'],
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
  usage:
    'Clean up deployed functions, layers and sandbox images by deleting older versions',
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
    sandbox: {
      usage:
        'Sandbox name. Limits cleanup to the image versions of the specified sandbox (AWS Lambda MicroVMs)',
      required: false,
      type: 'string',
    },
    includeLayers: {
      usage: 'Boolean flag. Includes the pruning of Lambda layers.',
      shortcut: 'i',
      required: false,
      type: 'boolean',
    },
    includeArtifacts: {
      usage:
        'Boolean flag. Also mark deployment artifacts that no longer back any function or layer version, and delete unused sandbox zips.',
      shortcut: 'a',
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
