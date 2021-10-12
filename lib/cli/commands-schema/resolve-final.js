// Resolves final schema of commands for given service configuration

'use strict';

const _ = require('lodash');

const serviceCommands = require('./service');
const awsServiceCommands = require('./aws-service');
const serviceOptions = require('./common-options/service');
const awsServiceOptions = require('./common-options/aws-service');
const { logWarning } = require('../../classes/Error');
const { log } = require('@serverless/utils/log');

const deprecatedEventPattern = /^deprecated#(.*?)(?:->(.*?))?$/;

module.exports = (loadedPlugins, { providerName }) => {
  const commands = new Map(providerName === 'aws' ? awsServiceCommands : serviceCommands);

  if (providerName !== 'aws') {
    // Recognize AWS provider commands adapted in context of other provider
    // Those commands do not have to be defined as "commands" in plugin.
    // It's good enough if hooks for command lifecycle events are setup
    // and our detection confirms on that.
    const optionalServiceCommandsHooksMap = new Map(
      _.flattenDepth(
        Array.from(awsServiceCommands)
          .filter(([name]) => !serviceCommands.has(name))
          .map(([name, schema]) => {
            const lifecycleEventNamePrefix = name.split(' ').join(':');
            return (schema.lifecycleEvents || []).map((lifecycleEventBaseName) => {
              if (lifecycleEventBaseName.startsWith('deprecated#')) {
                lifecycleEventBaseName = lifecycleEventBaseName.match(deprecatedEventPattern)[1];
              }
              const lifecycleEventName = `${lifecycleEventNamePrefix}:${lifecycleEventBaseName}`;
              return [
                [`before:${lifecycleEventName}`, name],
                [lifecycleEventName, name],
                [`after:${lifecycleEventName}`, name],
              ];
            });
          }),
        2
      )
    );

    const awsSpecificOptionNames = new Set(
      Object.keys(awsServiceOptions).filter((optionName) => !serviceOptions[optionName])
    );

    for (const loadedPlugin of loadedPlugins) {
      if (!loadedPlugin.hooks) continue;
      for (const hookName of Object.keys(loadedPlugin.hooks)) {
        const awsCommandName = optionalServiceCommandsHooksMap.get(hookName);
        if (awsCommandName && !commands.has(awsCommandName)) {
          const schema = _.merge({}, awsServiceCommands.get(awsCommandName), {
            isExtension: true,
            sourcePlugin: loadedPlugin,
          });
          for (const awsSpecificOptionName of awsSpecificOptionNames) {
            delete schema.options[awsSpecificOptionName];
          }
          commands.set(awsCommandName, schema);
        }
      }
    }
  }

  const missingOptionTypes = new Map();
  const resolveCommands = (loadedPlugin, config, commandPrefix = '') => {
    if (!config.commands) return;
    for (const [commandName, commandConfig] of Object.entries(config.commands)) {
      if (commandConfig.type === 'entrypoint') continue;
      const fullCommandName = `${commandPrefix}${commandName}`;
      if (commandConfig.type !== 'container') {
        const schema = commands.has(fullCommandName)
          ? _.merge({}, commands.get(fullCommandName))
          : {
              usage: commandConfig.usage,
              serviceDependencyMode: 'required',
              isExtension: true,
              sourcePlugin: loadedPlugin,
              isHidden: commandConfig.isHidden,
              noSupportNotice: commandConfig.noSupportNotice,
              options: {},
            };
        if (commandConfig.lifecycleEvents) schema.lifecycleEvents = commandConfig.lifecycleEvents;
        if (commandConfig.options) {
          for (const [optionName, optionConfig] of Object.entries(commandConfig.options)) {
            if (!schema.options[optionName]) {
              schema.options[optionName] = optionConfig;
              if (!optionConfig.type) {
                if (!missingOptionTypes.has(loadedPlugin)) {
                  missingOptionTypes.set(loadedPlugin, new Set());
                }
                missingOptionTypes.get(loadedPlugin).add(optionName);
              }
            }
          }
        }

        const commonOptions = providerName === 'aws' ? awsServiceOptions : serviceOptions;

        // Put common options to end of index
        for (const optionName of Object.keys(commonOptions)) delete schema.options[optionName];
        Object.assign(schema.options, commonOptions);

        commands.set(fullCommandName, schema);
      }
      resolveCommands(loadedPlugin, commandConfig, `${fullCommandName} `);
    }
  };

  for (const loadedPlugin of loadedPlugins) resolveCommands(loadedPlugin, loadedPlugin);

  if (missingOptionTypes.size) {
    logWarning(
      'CLI options definitions were upgraded with "type" property (which could be one of "string", "boolean", "multiple"). ' +
        'Below listed plugins do not predefine type for introduced options:\n' +
        ` - ${Array.from(
          missingOptionTypes,
          ([plugin, optionNames]) =>
            `${plugin.constructor.name} for "${Array.from(optionNames).join('", "')}"`
        ).join('\n - ')}\n\n` +
        'Please report this issue in plugin issue tracker.'
    );
    log.warning(
      'CLI options definitions were upgraded with "type" property (which could be one of "string", "boolean", "multiple"). ' +
        'Plugins listed below do not predefine type for introduced options:\n' +
        ` - ${Array.from(
          missingOptionTypes,
          ([plugin, optionNames]) =>
            `${plugin.constructor.name} for "${Array.from(optionNames).join('", "')}"`
        ).join('\n - ')}\n\n` +
        'Please report this issue in issue tracker of the corresponding plugin.\n'
    );
  }

  return commands;
};
