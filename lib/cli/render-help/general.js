'use strict';

const chalk = require('chalk');
const { legacy, writeText, style } = require('@serverless/utils/log');
const { version } = require('../../../package');
const globalOptions = require('../commands-schema/common-options/global');
const resolveInput = require('../resolve-input');
const generateCommandUsage = require('./generate-command-usage');
const renderOptions = require('./options');

module.exports = (loadedPlugins) => {
  const { commandsSchema } = resolveInput();

  writeText(
    `Serverless Framework v${version}`,
    null,
    style.aside('Usage'),
    'serverless <command> <options>',
    'sls <command> <options>',
    null,
    style.aside('Get started'),
    `Run ${style.strong('serverless')} to interactively setup a project.`,
    'Use --help-interactive to display the interactive setup help.',
    null,
    style.aside('Monitoring'),
    'Enable performance and error monitoring with the Serverless Dashboard.',
    `Learn more: ${style.linkStrong('https://serverless.com/monitoring')}`,
    null,
    style.aside('Plugins'),
    'Extend the Serverless Framework with plugins.',
    `Explore plugins: ${style.linkStrong('https://serverless.com/plugins')}`,
    null,
    style.aside('Options')
  );

  renderOptions(globalOptions, { shouldWriteModernOnly: true });

  const allCommands = new Map(
    Array.from(commandsSchema).filter(([commandName, { isHidden }]) => commandName && !isHidden)
  );
  const mainCommands = new Map(
    Array.from(allCommands).filter(([, { groupName }]) => groupName === 'main')
  );

  if (mainCommands.size) {
    writeText(null, style.aside('Main commands'));
    for (const [commandName, commandSchema] of mainCommands) {
      writeText(generateCommandUsage(commandName, commandSchema, { isModern: true }));
    }
    writeText(null, style.aside('Other commands'));
  } else {
    writeText(null, style.aside('All commands'));
  }

  const extensionCommandsSchema = new Map();

  for (const [commandName, commandSchema] of allCommands) {
    if (commandSchema.isExtension) {
      if (!extensionCommandsSchema.has(commandSchema.sourcePlugin)) {
        extensionCommandsSchema.set(commandSchema.sourcePlugin, new Map());
      }
      extensionCommandsSchema.get(commandSchema.sourcePlugin).set(commandName, commandSchema);
      continue;
    }
    if (commandSchema.groupName === 'main') continue;

    writeText(generateCommandUsage(commandName, commandSchema, { isModern: true }));
  }

  if (loadedPlugins.size) {
    if (extensionCommandsSchema.size) {
      for (const [plugin, pluginCommandsSchema] of extensionCommandsSchema) {
        writeText(null, style.aside(plugin.constructor.name));
        for (const [commandName, commandSchema] of pluginCommandsSchema) {
          writeText(generateCommandUsage(commandName, commandSchema, { isModern: true }));
        }
      }
    }
  }
  writeText();

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

  for (const [commandName, commandSchema] of allCommands) {
    if (commandSchema.isExtension) continue;
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

  legacy.write(`${lines.join('\n')}\n`);
};
