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
  },
  lifecycleEvents: ['dev'],
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
})

commands.set('invoke', {
  groupName: 'main',
  usage: 'Invoke a deployed function',
  options: {
    function: {
      type: 'string',
      usage: 'The function name',
      required: true,
      shortcut: 'f',
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
  usage: 'Output the logs of a deployed function',
  options: {
    function: {
      type: 'string',
      usage: 'The function name',
      required: true,
      shortcut: 'f',
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
