'use strict';

const serviceOptions = require('./common-options/service');
const awsServiceOptions = require('./common-options/aws-service');
const noServiceCommands = require('./no-service');

const commands = (module.exports = new Map());

commands.commonOptions = serviceOptions;

commands.set('package', {
  usage: 'Packages a Serverless service',
  hasAwsExtension: true,
  options: {
    package: {
      usage: 'Output path for the package',
      shortcut: 'p',
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
});

commands.set('plugin install', {
  usage: 'Install and add a plugin to your service',
  options: {
    name: {
      usage: 'The plugin name',
      required: true,
      shortcut: 'n',
    },
  },
  lifecycleEvents: ['install'],
});

commands.set('plugin uninstall', {
  usage: 'Uninstall and remove a plugin from your service',
  options: {
    name: {
      usage: 'The plugin name',
      required: true,
      shortcut: 'n',
    },
  },
  lifecycleEvents: ['uninstall'],
});

commands.set('print', {
  usage: 'Print your compiled and resolved config file',
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
  lifecycleEvents: ['print'],
});

for (const schema of commands.values()) {
  schema.serviceDependencyMode = 'required';
  if (!schema.options) schema.options = {};
  for (const optionSchema of Object.values(schema.options)) {
    if (!optionSchema.type) optionSchema.type = 'string';
  }
  Object.assign(schema.options, schema.hasAwsExtension ? awsServiceOptions : serviceOptions);
}

for (const [name, schema] of noServiceCommands) commands.set(name, schema);
