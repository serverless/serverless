import utils from '@serverlessinc/sf-core/src/utils.js'
import globalOptions from '../commands-options-schema.js'
import generateCommandUsage from './generate-command-usage.js'
import renderOptions from './options.js'

const { writeText, style, log } = utils

export default ({ loadedPlugins, commandsSchema, version }) => {
  log.logo()

  writeText(`${style.aside('Usage')}
  serverless <command> <options>
  sls <command> <options>

${style.aside('Get Started')}
  Run ${style.strong('serverless')} to interactively setup a project.

${style.aside('Dashboard')}
  See metrics, traces, logs, errors, deployments and more in Serverless Framework Dashboard.
  Learn more: ${style.linkStrong('https://app.serverless.com')}

${style.aside('Plugins')}
  Extend the Serverless Framework with plugins.
  Explore plugins: ${style.linkStrong('https://serverless.com/plugins')}

${style.aside('Options')}`)

  renderOptions(globalOptions, { shouldWriteModernOnly: true })
  writeText()

  const allCommands = new Map(
    Array.from(commandsSchema).filter(
      ([commandName, { isHidden }]) => commandName && !isHidden,
    ),
  )
  const mainCommands = new Map(
    Array.from(allCommands).filter(([, { groupName }]) => groupName === 'main'),
  )

  if (mainCommands.size) {
    writeText(null, style.aside('Main commands'))
    for (const [commandName, commandSchema] of mainCommands) {
      writeText(generateCommandUsage(commandName, commandSchema))
    }
    writeText()
    writeText(null, style.aside('Other commands'))
  } else {
    writeText(null, style.aside('All commands'))
  }

  const extensionCommandsSchema = new Map()

  for (const [commandName, commandSchema] of allCommands) {
    if (commandSchema.isExtension) {
      if (!extensionCommandsSchema.has(commandSchema.sourcePlugin)) {
        extensionCommandsSchema.set(commandSchema.sourcePlugin, new Map())
      }
      extensionCommandsSchema
        .get(commandSchema.sourcePlugin)
        .set(commandName, commandSchema)
      continue
    }
    if (commandSchema.groupName === 'main') continue

    writeText(generateCommandUsage(commandName, commandSchema))
  }

  if (loadedPlugins.size) {
    if (extensionCommandsSchema.size) {
      for (const [plugin, pluginCommandsSchema] of extensionCommandsSchema) {
        writeText(null, style.aside(plugin.constructor.name))
        for (const [commandName, commandSchema] of pluginCommandsSchema) {
          writeText(generateCommandUsage(commandName, commandSchema))
        }
      }
    }
  }
  writeText()
}
