'use strict';

const serviceOptions = require('./common-options/service');
const awsServiceOptions = require('./common-options/aws-service');

const commands = (module.exports = new Map());

commands.set('package', {
  usage: 'Packages a Serverless service',
  hasAwsExtension: true,
  options: {
    package: {
      usage: 'Output path for the package',
      shortcut: 'p',
    },
  },
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
});

for (const schema of commands.values()) {
  schema.serviceDependencyMode = 'required';
  if (!schema.options) schema.options = {};
  Object.assign(schema.options, schema.hasAwsExtension ? awsServiceOptions : serviceOptions);
}
