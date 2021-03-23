// Resolves final schema of commands for given service configuration

'use strict';

const _ = require('lodash');

const serviceCommands = require('./service');
const awsServiceCommands = require('./aws-service');
const serviceOptions = require('./common-options/service');
const awsServiceOptions = require('./common-options/aws-service');

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
          const awsCommandSchema = awsServiceCommands.get(awsCommandName);
          const schema = {
            ...awsCommandSchema,
            options: { ...awsCommandSchema.options },
          };
          for (const awsSpecificOptionName of awsSpecificOptionNames) {
            delete schema.options[awsSpecificOptionName];
          }
          commands.set(awsCommandName, schema);
        }
      }
    }
  }

  const resolveCommands = (config, commandPrefix = '') => {
    if (!config.commands) return;
    for (const [commandName, commandConfig] of Object.entries(config.commands)) {
      if (commandConfig.type === 'entrypoint') continue;
      const fullCommandName = `${commandPrefix}${commandName}`;
      if (commandConfig.type !== 'container') {
        const schema = commands.get(fullCommandName) || {
          usage: commandConfig.usage,
          serviceDependencyMode: 'required',
          isHidden: commandConfig.isHidden,
          noSupportNotice: commandConfig.noSupportNotice,
          options: {},
        };

        if (commandConfig.lifecycleEvents) schema.lifecycleEvents = commandConfig.lifecycleEvents;
        if (commandConfig.options) {
          for (const [optionName, optionConfig] of Object.entries(commandConfig.options)) {
            if (!schema.options[optionName]) schema.options[optionName] = optionConfig;
          }
        }

        const commonOptions = providerName === 'aws' ? awsServiceOptions : serviceOptions;

        // Put common options to end of index
        for (const optionName of Object.keys(commonOptions)) delete schema.options[optionName];
        Object.assign(schema.options, commonOptions);

        commands.set(fullCommandName, schema);
      }
      resolveCommands(commandConfig, `${fullCommandName} `);
    }
  };

  for (const loadedPlugin of loadedPlugins) resolveCommands(loadedPlugin);

  return commands;
};
