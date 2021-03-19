'use strict';

const commands = (module.exports = new Map());

commands.set('', {
  usage: 'Interactive Quickstart',
  serviceDependencyMode: 'optional',
  hasAwsExtension: true,
});

commands.set('config', {
  usage: 'Configure Serverless',
  options: {
    autoupdate: {
      usage: 'Turn on auto update mechanism (turn off via "--no-autoupdate")',
      type: 'boolean',
    },
  },
});

commands.set('config credentials', {
  usage: 'Configures a new provider profile for the Serverless Framework',
  hasAwsExtension: true,
  options: {
    provider: {
      usage: 'Name of the provider. Supported providers: aws',
      required: true,
      shortcut: 'p',
    },
    key: {
      usage: 'Access key for the provider',
      shortcut: 'k',
      required: true,
    },
    secret: {
      usage: 'Secret key for the provider',
      shortcut: 's',
      required: true,
    },
    profile: {
      usage: 'Name of the profile you wish to create. Defaults to "default"',
      shortcut: 'n',
    },
    overwrite: {
      usage: 'Overwrite the existing profile configuration in the credentials file',
      shortcut: 'o',
      type: 'boolean',
    },
  },
});

(() => {
  const isHidden = process.platform === 'win32';
  const noSupportNotice = '<tab> completion is not supported on Windows';

  commands.set('config tabcompletion install', {
    usage: 'Install a <tab> completion for chosen shell',
    isHidden,
    noSupportNotice,
    options: {
      shell: {
        usage:
          'Shell for which <tab> completion should be installed. ' +
          'Supported options: bash (default), zsh, fish ',
        shortcut: 's',
      },
      location: {
        usage: 'Custom location for shell config',
        shortcut: 'l',
      },
    },
  });
  commands.set('config tabcompletion uninstall', {
    usage: 'Uninstall a <tab> completion',
    isHidden,
    noSupportNotice,
  });
})();

commands.set('create', {
  usage: 'Create new Serverless service',
  options: {
    'template': {
      usage:
        'Template for the service. Available templates: ' +
        `${require('../templates/recommended-list/human-readable')}`,
      shortcut: 't',
    },
    'template-url': {
      usage: 'Template URL for the service. Supports: GitHub, BitBucket',
      shortcut: 'u',
    },
    'template-path': {
      usage: 'Template local path for the service.',
    },
    'path': {
      usage: 'The path where the service should be created (e.g. --path my-service)',
      shortcut: 'p',
    },
    'name': {
      usage: 'Name for the service. Overwrites the default name of the created service.',
      shortcut: 'n',
    },
  },
});

commands.set('dashboard', {
  usage: 'Open the Serverless dashboard',
});

commands.set('deploy', {
  usage: 'Deploy a Serverless service',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    'conceal': {
      usage: 'Hide secrets from the output (e.g. API Gateway key values)',
      type: 'boolean',
    },
    'package': {
      usage: 'Path of the deployment package',
      shortcut: 'p',
    },
    'verbose': {
      usage: 'Show all stack events during deployment',
      shortcut: 'v',
      type: 'boolean',
    },
    'force': {
      usage: 'Forces a deployment to take place',
      type: 'boolean',
    },
    'function': {
      usage: "Function name. Deploys a single function (see 'deploy function')",
      shortcut: 'f',
    },
    'aws-s3-accelerate': {
      usage: 'Enables S3 Transfer Acceleration making uploading artifacts much faster.',
      type: 'boolean',
    },
  },
});

commands.set('deploy function', {
  usage: 'Deploy a single function from the service',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    'function': {
      usage: 'Name of the function',
      shortcut: 'f',
      required: true,
    },
    'force': {
      usage: 'Forces a deployment to take place',
      type: 'boolean',
    },
    'update-config': {
      usage: 'Updates function configuration, e.g. Timeout or Memory Size without deploying code', // eslint-disable-line max-len
      shortcut: 'u',
      type: 'boolean',
    },
  },
});

commands.set('deploy list', {
  usage: 'List deployed version of your Serverless Service',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
});
commands.set('deploy list functions', {
  usage: 'List all the deployed functions and their versions',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
});

commands.get('generate-event', {
  usage: 'Generate event',
  options: {
    type: {
      usage:
        'Specify event type. "aws:apiGateway", "aws:sns", "aws:sqs", "aws:dynamo", ' +
        '"aws:kinesis", "aws:cloudWatchLog", "aws:s3", "aws:alexaSmartHome", "aws:alexaSkill", ' +
        '"aws:cloudWatch", "aws:iot", "aws:cognitoUserPool","aws:websocket" are supported.',
      shortcut: 't',
      required: true,
    },
    body: {
      usage: 'Specify the body for the message, request, or stream event.',
      shortcut: 'b',
    },
  },
});

commands.set('info', {
  usage: 'Display information about the service',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    conceal: {
      usage: 'Hide secrets from the output (e.g. API Gateway key values)',
      type: 'boolean',
    },
  },
});

commands.set('install', {
  usage: 'Install a Serverless service from GitHub or a plugin from the Serverless registry',
  options: {
    url: {
      usage: 'URL of the Serverless service on GitHub',
      required: true,
      shortcut: 'u',
    },
    name: {
      usage: 'Name for the service',
      shortcut: 'n',
    },
  },
});

commands.set('invoke', {
  usage: 'Invoke a deployed function',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    function: {
      usage: 'The function name',
      required: true,
      shortcut: 'f',
    },
    qualifier: {
      usage: 'Version number or alias to invoke',
      shortcut: 'q',
    },
    path: {
      usage: 'Path to JSON or YAML file holding input data',
      shortcut: 'p',
    },
    type: {
      usage: 'Type of invocation',
      shortcut: 't',
    },
    log: {
      usage: 'Trigger logging data output',
      shortcut: 'l',
      type: 'boolean',
    },
    data: {
      usage: 'Input data',
      shortcut: 'd',
    },
    raw: {
      usage: 'Flag to pass input data as a raw string',
      type: 'boolean',
    },
    context: {
      usage: 'Context of the service',
    },
    contextPath: {
      usage: 'Path to JSON or YAML file holding context data',
    },
  },
});

commands.set('invoke local', {
  usage: 'Invoke function locally',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    'function': {
      usage: 'Name of the function',
      shortcut: 'f',
      required: true,
    },
    'path': {
      usage: 'Path to JSON or YAML file holding input data',
      shortcut: 'p',
    },
    'data': {
      usage: 'input data',
      shortcut: 'd',
    },
    'raw': {
      usage: 'Flag to pass input data as a raw string',
      type: 'boolean',
    },
    'context': {
      usage: 'Context of the service',
    },
    'contextPath': {
      usage: 'Path to JSON or YAML file holding context data',
      shortcut: 'x',
    },
    'env': {
      usage: 'Override environment variables. e.g. --env VAR1=val1 --env VAR2=val2',
      shortcut: 'e',
      type: 'multiple',
    },
    'docker': { usage: 'Flag to turn on docker use for node/python/ruby/java', type: 'boolean' },
    'docker-arg': {
      usage: 'Arguments to docker run command. e.g. --docker-arg "-p 9229:9229"',
    },
  },
});

commands.set('login', {
  usage: 'Login or sign up for Serverless',
});

commands.set('logout', {
  usage: 'Logout from Serverless',
});

commands.set('logs', {
  usage: 'Output the logs of a deployed function',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    function: {
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
      usage:
        'Logs before this time will not be displayed. Default: `10m` (last 10 minutes logs only)',
    },
    filter: {
      usage: 'A filter pattern',
    },
    interval: {
      usage: 'Tail polling interval in milliseconds. Default: `1000`',
      shortcut: 'i',
    },
  },
});

commands.set('metrics', {
  usage: 'Show metrics for a specific function',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    function: {
      usage: 'The function name',
      shortcut: 'f',
    },
    startTime: {
      usage: 'Start time for the metrics retrieval (e.g. 1970-01-01)',
    },
    endTime: {
      usage: 'End time for the metrics retrieval (e.g. 1970-01-01)',
    },
  },
});

commands.set('output get', {
  usage: 'Get value of dashboard deployment profile parameter',
  serviceDependencyMode: 'optional',
  hasAwsExtension: true,
  options: {
    name: { usage: 'Ouptut name', required: true },
    service: { usage: 'Dashboard service' },
  },
});

commands.set('output list', {
  usage: 'List all dashboard deployment profile parameters',
  serviceDependencyMode: 'optional',
  hasAwsExtension: true,
  options: {
    service: { usage: 'Dashboard service' },
  },
});

commands.set('package', {
  usage: 'Packages a Serverless service',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    package: {
      usage: 'Output path for the package',
      shortcut: 'p',
    },
  },
});

commands.set('param get', {
  usage: 'Get value of dashboard service output',
  serviceDependencyMode: 'optional',
  hasAwsExtension: true,
  options: {
    name: { usage: 'Ouptut name', required: true },
  },
});

commands.set('param list', {
  usage: 'List all dashboard deployment profile parameters',
  serviceDependencyMode: 'optional',
  hasAwsExtension: true,
});

commands.set('plugin install', {
  usage: 'Install and add a plugin to your service',
  serviceDependencyMode: 'required',
  options: {
    name: {
      usage: 'The plugin name',
      required: true,
      shortcut: 'n',
    },
  },
});

commands.set('plugin list', {
  usage: 'Lists all available plugins',
});

commands.set('plugin search', {
  usage: 'Search for plugins',
  options: {
    query: {
      usage: 'Search query',
      required: true,
      shortcut: 'q',
    },
  },
});

commands.set('plugin uninstall', {
  usage: 'Uninstall and remove a plugin from your service',
  serviceDependencyMode: 'required',
  options: {
    name: {
      usage: 'The plugin name',
      required: true,
      shortcut: 'n',
    },
  },
});

commands.set('print', {
  usage: 'Print your compiled and resolved config file',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    format: {
      usage: 'Print configuration in given format ("yaml", "json", "text"). Default: yaml',
    },
    path: {
      usage: 'Optional period-separated path to print a sub-value (eg: "provider.name")',
    },
    transform: {
      usage: 'Optional transform-function to apply to the value ("keys")',
    },
  },
});

commands.set('remove', {
  usage: 'Remove Serverless service and all resources',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    verbose: {
      usage: 'Show all stack events during deployment',
      shortcut: 'v',
      type: 'boolean',
    },
  },
});

commands.set('rollback', {
  usage: 'Rollback the Serverless service to a specific deployment',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    timestamp: {
      usage: 'Timestamp of the deployment (list deployments with `serverless deploy list`)',
      shortcut: 't',
      required: false,
    },
    verbose: {
      usage: 'Show all stack events during deployment',
      shortcut: 'v',
      type: 'boolean',
    },
  },
});

commands.set('rollback function', {
  usage: 'Rollback the function to the previous version',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    'function': {
      usage: 'Name of the function',
      shortcut: 'f',
      required: true,
    },
    'function-version': {
      usage: 'Version of the function',
      required: true,
    },
  },
});

commands.set('slstats', {
  usage: 'Enable or disable stats',
  options: {
    enable: {
      usage: 'Enable stats ("--enable")',
      shortcut: 'e',
      type: 'boolean',
    },
    disable: {
      usage: 'Disable stats ("--disable")',
      shortcut: 'd',
      type: 'boolean',
    },
  },
});

commands.set('studio', {
  usage: 'Develop a Serverless application in the cloud.',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    autoStage: {
      usage: 'If specified, generate a random stage. This stage will be removed on exit.',
      shortcut: 'a',
      type: 'boolean',
    },
  },
});

commands.get('test', {
  usage: 'Run HTTP tests',
  serviceDependencyMode: 'required',
  hasAwsExtension: true,
  options: {
    function: {
      usage: 'Specify the function to test',
      shortcut: 'f',
    },
    test: {
      usage: 'Specify a specific test to run',
      shortcut: 't',
    },
  },
});

(() => {
  const isHidden = !require('../utils/isStandaloneExecutable') || process.platform === 'win32';
  const noSupportNotice =
    "It's applicable only in context of a standalone executable instance " +
    'in non Windows environment.';

  commands.set('upgrade', {
    usage: 'Upgrade Serverless',
    isHidden,
    noSupportNotice,
    options: {
      major: {
        usage: 'Enable upgrade to a new major release',
        type: 'boolean',
      },
    },
  });
  commands.set('uninstall', {
    usage: 'Uninstall Serverless',
    isHidden,
    noSupportNotice,
  });
})();

const serviceOptions = {
  config: {
    usage: 'Path to serverless config file',
    shortcut: 'c',
  },
};

const awsServiceOptions = {
  'stage': {
    usage: 'Stage of the service',
    shortcut: 's',
  },
  'region': {
    usage: 'Region of the service',
    shortcut: 'r',
  },
  'app': { usage: 'Dashboard app' },
  'org': { usage: 'Dashboard org' },
  'use-local-credentials': {
    usage:
      'Rely on locally resolved AWS credentials instead of loading them from ' +
      'Dashboard provider settings (applies only to services integrated with Dashboard)',
    type: 'boolean',
  },
};

for (const [name, schema] of commands) {
  if (!schema.options) schema.options = {};
  if (schema.serviceDependencyMode) {
    Object.assign(schema.options, serviceOptions);
    if (schema.hasAwsExtension) Object.assign(schema.options, awsServiceOptions);
  }
  if (name) {
    schema.options.help = { usage: 'Show this message', shortcut: 'h', type: 'boolean' };
  } else {
    schema.options['help-interactive'] = { usage: 'Show this message', type: 'boolean' };
  }
}
