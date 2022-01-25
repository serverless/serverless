'use strict';

const globalOptions = require('./common-options/global');
const serviceOptions = require('./common-options/service');
const awsServiceOptions = require('./common-options/aws-service');

const commands = (module.exports = new Map());

commands.set('', {
  usage: 'Interactive Quickstart',
  serviceDependencyMode: 'optional',
  hasAwsExtension: true,
  options: {
    'help-interactive': { usage: 'Show this message', type: 'boolean' },
    'name': {
      usage: 'Name for the service.',
    },
    'template': {
      usage: 'Name of template for the service.',
    },
    'template-path': {
      usage: 'Template local path for the service.',
    },
    'template-url': {
      usage: 'Template url for the service.',
    },
  },
  lifecycleEvents: ['initializeService', 'setupAws', 'autoUpdate', 'end'],
});

commands.set('config', {
  usage: 'Configure Serverless',
  options: {
    autoupdate: {
      usage: 'Turn on auto update mechanism (turn off via "--no-autoupdate")',
      type: 'boolean',
    },
  },
  lifecycleEvents: ['config'],
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
  lifecycleEvents: ['config'],
});

commands.set('create', {
  usage: 'Create new Serverless service',
  options: {
    'template': {
      usage:
        'Template for the service. Available templates: ' +
        `${require('../../templates/recommended-list/human-readable')}`,
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
  lifecycleEvents: ['create'],
});

commands.set('dashboard', {
  usage: 'Open the Serverless dashboard',
  lifecycleEvents: ['dashboard'],
  serviceDependencyMode: 'optional',
});

commands.set('doctor', {
  usage: 'Print status on reported deprecations triggered in the last command run',
});

commands.set('generate-event', {
  usage: 'Generate event',
  lifecycleEvents: ['generate-event'],
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

commands.set('help', {
  usage: 'Show this help',
  serviceDependencyMode: 'optional',
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
  lifecycleEvents: ['install'],
});

commands.set('login', {
  usage: 'Login or sign up for Serverless',
  lifecycleEvents: ['login'],
});

commands.set('logout', {
  usage: 'Logout from Serverless',
  lifecycleEvents: ['logout'],
});

commands.set('output get', {
  usage: 'Get value of dashboard deployment profile parameter',
  serviceDependencyMode: 'optional',
  hasAwsExtension: true,
  options: {
    name: { usage: 'Ouptut name', required: true },
    service: { usage: 'Dashboard service' },
  },
  lifecycleEvents: ['get'],
});

commands.set('output list', {
  usage: 'List all dashboard deployment profile parameters',
  serviceDependencyMode: 'optional',
  hasAwsExtension: true,
  options: {
    service: { usage: 'Dashboard service' },
  },
  lifecycleEvents: ['list'],
});

commands.set('param get', {
  usage: 'Get value of dashboard service output',
  serviceDependencyMode: 'optional',
  hasAwsExtension: true,
  options: {
    name: { usage: 'Ouptut name', required: true },
  },
  lifecycleEvents: ['get'],
});

commands.set('param list', {
  usage: 'List all dashboard deployment profile parameters',
  serviceDependencyMode: 'optional',
  hasAwsExtension: true,
  lifecycleEvents: ['list'],
});

commands.set('plugin list', {
  usage: 'Lists all available plugins',
  lifecycleEvents: ['list'],
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
  lifecycleEvents: ['search'],
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
  lifecycleEvents: ['slstats'],
});

(() => {
  const isHidden = !require('../../utils/is-standalone-executable') || process.platform === 'win32';
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
    lifecycleEvents: ['upgrade'],
  });
  commands.set('uninstall', {
    usage: 'Uninstall Serverless',
    isHidden,
    noSupportNotice,
    lifecycleEvents: ['uninstall'],
  });
})();

for (const [name, schema] of commands) {
  if (!schema.options) schema.options = {};
  for (const optionSchema of Object.values(schema.options)) {
    if (!optionSchema.type) optionSchema.type = 'string';
  }
  if (schema.serviceDependencyMode) {
    Object.assign(schema.options, schema.hasAwsExtension ? awsServiceOptions : serviceOptions);
  } else {
    Object.assign(schema.options, globalOptions);
  }
  if (!name) {
    // Necessary tweaks for Interactive CLI help
    schema.options.help = { ...schema.options.help, usage: 'Show general help info' };
    schema.options.version = { ...schema.options.version, shortcut: 'v' };
  }
}
