'use strict';

const chalk = require('chalk');
const resolveInput = require('../resolve-input');
const generateCommandUsage = require('./generate-command-usage');

module.exports = (loadedPlugins) => {
  const { commandsSchema } = resolveInput();

  const lines = [
    '',
    chalk.yellow.underline('Commands'),
    chalk.dim('* You can run commands with "serverless" or the shortcut "sls"'),
    chalk.dim('* Pass "--no-color" to disable CLI colors'),
    chalk.dim('* Pass "--help" after any <command> for contextual help'),
    '',
    chalk.yellow.underline('Interactive Quickstart'),
    chalk.dim(
      `* Run serverless (or shortcut sls) without any arguments to initialize an interactive setup
  of functionalities related to given service or current environment`
    ),
    chalk.dim('* Pass "--help-interactive" for contextual help on interactive CLI options'),
    '',
    chalk.yellow.underline('Serverless Components'),
    chalk.dim(
      '* Run serverless (or shortcut sls) in context of a component service to initialize a components CLI'
    ),
    chalk.dim('* Pass "--help-components" for contextual help on Serverless Components'),
    '',
    chalk.yellow.underline('Framework'),
    chalk.dim('* Documentation: http://slss.io/docs'),
    '',
    chalk.yellow.underline('Environment Variables'),
    chalk.dim('* Set SLS_DEBUG=* to see debugging logs'),
    chalk.dim('* Set SLS_WARNING_DISABLE=* to hide warnings from the output'),
    chalk.dim('* Set SLS_DEPRECATION_DISABLE=* to disable deprecation logs'),
    chalk.dim(
      "* Set SLS_MAX_CONCURRENT_ARTIFACTS_UPLOADS to control the maximum S3 upload SDK requests that are sent in parallel during the deployment of the service's artifacts. The default is 3. Note: increasing this too high might, actually, downgrade the overall upload speed"
    ),
    '',
    chalk.yellow.underline('General Commands'),
    '',
  ];

  const extensionCommandsSchema = new Map();

  for (const [commandName, commandSchema] of commandsSchema) {
    if (!commandName) continue;
    if (commandSchema.isHidden) continue;
    if (!commandSchema.lifecycleEvents) continue;
    if (commandSchema.isExtension) {
      if (!extensionCommandsSchema.has(commandSchema.sourcePlugin)) {
        extensionCommandsSchema.set(commandSchema.sourcePlugin, new Map());
      }
      extensionCommandsSchema.get(commandSchema.sourcePlugin).set(commandName, commandSchema);
      continue;
    }
    lines.push(generateCommandUsage(commandName, commandSchema));
  }

  lines.push('');

  if (loadedPlugins.size) {
    // print all the installed plugins
    lines.push(
      chalk.yellow.underline('Plugins'),
      Array.from(loadedPlugins, (plugin) => plugin.constructor.name).join(', ')
    );

    if (extensionCommandsSchema.size) {
      lines.push('', chalk.yellow.underline('Commands by plugin'), '');

      for (const [plugin, pluginCommandsSchema] of extensionCommandsSchema) {
        lines.push(plugin.constructor.name);
        for (const [commandName, commandSchema] of pluginCommandsSchema) {
          lines.push(generateCommandUsage(commandName, commandSchema));
        }
        lines.push('');
      }
    }
  }

  process.stdout.write(`${lines.join('\n')}\n`);
};
