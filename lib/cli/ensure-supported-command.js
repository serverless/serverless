'use strict';

const { distance: getDistance } = require('fastest-levenshtein');
const ServerlessError = require('../serverless-error');

const getCommandSuggestion = (command, commandsSchema) => {
  let suggestion;
  let minValue = 0;
  for (const correctCommand of commandsSchema.keys()) {
    const distance = getDistance(command, correctCommand);
    if (minValue === 0) {
      suggestion = correctCommand;
      minValue = distance;
    }

    if (minValue > distance) {
      suggestion = correctCommand;
      minValue = distance;
    }
  }
  if (minValue >= 3) return '';
  return ` Did you mean "${suggestion}"?`;
};

module.exports = ({
  command,
  options,
  commandSchema,
  commandsSchema,
}) => {

  // If the command is not found, suggest the closest match
  if (!commandSchema) {
    const err = new ServerlessError(
      `Serverless command "${command}" not found.` +
      `${getCommandSuggestion(command, commandsSchema)} ` +
      'Run "serverless help" for a list of all available commands.',
      'UNRECOGNIZED_CLI_COMMAND'
    );
    err.stack = undefined
    throw err;
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
    const schemaOptionDetails = commandSchema.options[optionName];

    // Check if the option is supported by the command
    if (!schemaOptionDetails) {
      throw new ServerlessError(
        `Unrecognized option "${optionName}". Run "serverless ${command} --help" for a list of all available options.`,
        'UNSUPPORTED_CLI_OPTIONS'
      );
    }

    // Check if the option is of the correct type. Check for arrays specifically too.
    if (schemaOptionDetails.type === 'array') {
      if (!Array.isArray(optionValue)) {
        throw new ServerlessError(
          `Option "${optionName}" is of type "${typeof optionValue}" but expected type "array".`,
          'INVALID_OPTION_TYPE'
        );
      }
    }
    else if (schemaOptionDetails.type !== 'array' && typeof optionValue !== schemaOptionDetails.type) {
      throw new ServerlessError(
        `Option "${optionName}" is of type "${typeof optionValue}" but expected type "${schemaOptionDetails.type}".`,
        'INVALID_OPTION_TYPE'
      );
    }
  }

  // After validating all provided options, check if any required options are missing
  for (const [schemaOptionName, schemaOptionDetails] of Object.entries(commandSchema.options)) {
    if (schemaOptionDetails.required && !(schemaOptionName in options)) {
      throw new ServerlessError(
        `Option "${schemaOptionName}" is required for the "${command}". Run "serverless ${command} --help" for more info.`,
        'MISSING_REQUIRED_CLI_OPTION'
      );
    }
  }
};
