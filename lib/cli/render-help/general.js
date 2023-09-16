'use strict';

const { writeText, style } = require('@serverless/utils/log');
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
    style.aside('Dashboard'),
    'See metrics, traces, logs, errors, deployments and more in Serverless Framework Dashboard.',
    `Learn more: ${style.linkStrong('https://app.serverless.com')}`,
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
      writeText(generateCommandUsage(commandName, commandSchema));
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

    writeText(generateCommandUsage(commandName, commandSchema));
  }

  if (loadedPlugins.size) {
    if (extensionCommandsSchema.size) {
      for (const [plugin, pluginCommandsSchema] of extensionCommandsSchema) {
        writeText(null, style.aside(plugin.constructor.name));
        for (const [commandName, commandSchema] of pluginCommandsSchema) {
          writeText(generateCommandUsage(commandName, commandSchema));
        }
      }
    }
  }
  writeText();
};
