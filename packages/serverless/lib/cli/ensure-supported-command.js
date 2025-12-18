import { distance as getDistance } from 'fastest-levenshtein'
import ServerlessError from '../serverless-error.js'

const getCommandSuggestion = (command, commandsSchema) => {
  let suggestion
  let minValue = 0
  for (const correctCommand of commandsSchema.keys()) {
    const distance = getDistance(command, correctCommand)
    if (minValue === 0) {
      suggestion = correctCommand
      minValue = distance
    }

    if (minValue > distance) {
      suggestion = correctCommand
      minValue = distance
    }
  }
  if (minValue >= 3) return ''
  return ` Did you mean "${suggestion}"?`
}

export default ({ command, options, commandSchema, commandsSchema }) => {
  // If the command is not found, suggest the closest match
  if (!commandSchema) {
    let errorMessage =
      `Serverless command "${command}" not found.` +
      `${getCommandSuggestion(command, commandsSchema)} ` +
      'Run "serverless help" for a list of all available commands.'

    if (command === 'slstats') {
      errorMessage = `The "slstats" command was deprecated in v4.`
    }

    if (command === 'install') {
      errorMessage =
        'The "install" command was deprecated in v4. Please clone the repo instead.'
    }

    if (command === 'uninstall') {
      errorMessage = 'The "uninstall" command was deprecated in v4.'
    }

    if (command === 'create') {
      errorMessage = `The "create" command was deprecated in v4. To create a new project, run the "serverless" command instead.`
    }

    if (command === 'dashboard') {
      errorMessage = `The "dashboard" command was deprecated in v4.`
    }

    if (command === 'generate-event') {
      errorMessage = `The "generate-event" command was deprecated in v4.`
    }

    if (command === 'config credentials') {
      errorMessage = `The "config credentials" command was deprecated in v4. To configure your AWS credentials, run the "serverless" command instead.`
    }

    if (command === 'output get' || command === 'output list') {
      errorMessage = `This command was deprecated in v4. Please review your outputs in Serverless Framework Dashboard at https://app.serverless.com`
    }

    if (command === 'plugin search' || command === 'plugin list') {
      errorMessage = `This command was deprecated in v4. You can now list and search for plugins at https://www.serverless.com/plugins`
    }

    if (command === 'param get') {
      errorMessage = `This command was deprecated in v4. To get a param, please visit the Serverless Framework Dashboard at https://app.serverless.com`
    }

    const err = new ServerlessError(errorMessage, 'UNRECOGNIZED_CLI_COMMAND')
    err.stack = undefined
    throw err
  }

  /**
   * Validate Options
   *
   * Iterate over the options and check if they are:
   * - Supported by the command
   * - Required by the command
   * - The right type
   */
  for (const [optionName, optionValue] of Object.entries(options)) {
    let schemaCommandOption = commandSchema.options[optionName]

    // If no schema is found for the option, check if it's a common/global option
    if (!schemaCommandOption && commandsSchema.commonOptions) {
      schemaCommandOption = commandsSchema.commonOptions[optionName]
    }

    // Check if the option is supported by the command
    if (!schemaCommandOption) {
      throw new ServerlessError(
        `Unrecognized option "${optionName}". Run "serverless ${command} --help" for a list of all available options.`,
        'UNSUPPORTED_CLI_OPTIONS',
      )
    }

    // Check if the option is of the correct type. Check for arrays (i.e. "multiple") specifically too.
    if (schemaCommandOption.type === 'multiple') {
      if (!Array.isArray(optionValue)) {
        throw new ServerlessError(
          `Option "${optionName}" is of type "${typeof optionValue}" but expected type "array".`,
          'INVALID_OPTION_TYPE',
        )
      }
    } else if (
      schemaCommandOption.type !== 'array' &&
      typeof optionValue !== schemaCommandOption.type
    ) {
      throw new ServerlessError(
        `Option "${optionName}" is of type "${typeof optionValue}" but expected type "${
          schemaCommandOption.type
        }".`,
        'INVALID_OPTION_TYPE',
      )
    }
  }

  // After validating all provided options, check if any required options are missing
  for (const [schemaOptionName, schemaCommandOption] of Object.entries(
    commandSchema.options,
  )) {
    if (schemaCommandOption.required && !(schemaOptionName in options)) {
      throw new ServerlessError(
        `Option "${schemaOptionName}" is required for the "${command}" command. Run "serverless ${command} --help" for more info.`,
        'MISSING_REQUIRED_CLI_OPTION',
      )
    }
  }
}
