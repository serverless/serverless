/**
 * CLI params parser, to be used before we have deducted
 * what commands and options are supported in given context.
 */

import commandsSchema from './commands-schema.js'

/**
 * Parses command line arguments, identifies the command and
 * its options, and returns an object containing these
 * details. It also determines if the command is a
 * container command or if a help request has been made,
 * and sets corresponding flags in the returned object.
 */
export default (providedCommandsSchema = commandsSchema, commands, options) => {
  const command = commands.join(' ')
  const commandSchema = providedCommandsSchema.get(command)

  const result = {
    commands,
    options,
    command,
    commandSchema,
    commandsSchema: providedCommandsSchema,
  }
  if (!commandSchema) {
    result.isContainerCommand = Array.from(providedCommandsSchema.keys()).some(
      (commandName) => commandName.startsWith(`${command} `),
    )
    if (result.isContainerCommand) {
      result.isHelpRequest = true
      return result
    }
  }

  return result
}
