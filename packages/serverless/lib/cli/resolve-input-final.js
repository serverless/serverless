import _ from 'lodash'
import commandSchema from './commands-schema.js'
import serviceOptions from './commands-options-schema.js'
import logDeprecation from '../utils/log-deprecation.js'

/**
 * This module exports a function that processes loaded plugins and their
 * configurations, mapping out their commands and options into a commands Map.
 * It imports AWS service commands and common options, and merges them with
 * the commands and options from the loaded plugins. It also handles missing
 * option types by logging a deprecation warning.
 *
 * @param {Array} loadedPlugins - An array of loaded plugin objects.
 * @param {Object} configuration - The configuration object for the plugins.
 * @returns {Map} A Map object of commands and their options.
 */
export default (loadedPlugins, { configuration }) => {
  const commands = new Map(commandSchema)
  const missingOptionTypes = new Map()
  const commonOptions = serviceOptions
  commands.commonOptions = commonOptions

  /**
   * Recursively processes a configuration object for a plugin, mapping out its
   * commands and their options. It skips commands of type 'entrypoint', and for
   * other commands, it creates or updates a schema with details like usage,
   * lifecycle events, and options. If an option is missing the 'type' property,
   * it is added to the `missingOptionTypes` set for later processing.
   *
   * @param {Object} loadedPlugin - The loaded plugin object.
   * @param {Object} config - The configuration object for the plugin.
   * @param {string} commandPrefix - The prefix for the command (default is '').
   */
  const resolveCommands = (loadedPlugin, config, commandPrefix = '') => {
    if (!config.commands) return
    for (const [commandName, commandConfig] of Object.entries(
      config.commands,
    )) {
      if (commandConfig.type === 'entrypoint') continue
      const fullCommandName = `${commandPrefix}${commandName}`
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
            }
        if (commandConfig.lifecycleEvents)
          schema.lifecycleEvents = commandConfig.lifecycleEvents
        if (commandConfig.options) {
          for (const [optionName, optionConfig] of Object.entries(
            commandConfig.options,
          )) {
            if (!schema.options[optionName]) {
              schema.options[optionName] = optionConfig
              if (!optionConfig.type) {
                if (!missingOptionTypes.has(loadedPlugin)) {
                  missingOptionTypes.set(loadedPlugin, new Set())
                }
                missingOptionTypes.get(loadedPlugin).add(optionName)
              }
            }
          }
        }

        // Put common options to end of index
        for (const optionName of Object.keys(commonOptions))
          delete schema.options[optionName]
        Object.assign(schema.options, commonOptions)

        commands.set(fullCommandName, schema)
      }
      resolveCommands(loadedPlugin, commandConfig, `${fullCommandName} `)
    }
  }

  for (const loadedPlugin of loadedPlugins)
    resolveCommands(loadedPlugin, loadedPlugin)

  if (missingOptionTypes.size) {
    logDeprecation(
      'CLI_OPTIONS_SCHEMA_V3',
      'CLI options definitions were upgraded with "type" property (which could be one of "string", "boolean", "multiple"). ' +
        'Below listed plugins do not predefine type for introduced options:\n' +
        ` - ${Array.from(
          missingOptionTypes,
          ([plugin, optionNames]) =>
            `${plugin.constructor.name} for "${Array.from(optionNames).join(
              '", "',
            )}"`,
        ).join('\n - ')}\n` +
        'Please report this issue in plugin issue tracker.\n' +
        'Starting with next major release, this will be communicated with a thrown error.',
      { serviceConfig: configuration },
    )
  }

  return commands
}
