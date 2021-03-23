'use strict';

const { distance: getDistance } = require('fastest-levenshtein');
const resolveInput = require('./resolve-input');
const ServerlessError = require('../serverless-error');
const logDeprecation = require('../utils/logDeprecation');

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

module.exports = (configuration = null) => {
  const { command, options, isHelpRequest, commandSchema, commandsSchema } = resolveInput();

  if (!commandSchema) {
    if (isHelpRequest) return;
    throw new ServerlessError(
      `Serverless command "${command}" not found.` +
        `${getCommandSuggestion(command, commandsSchema)} ` +
        'Run "serverless help" for a list of all available commands.',
      'UNRECOGNIZED_CLI_COMMAND'
    );
  }
  const supportedOptions = new Set(Object.keys(commandSchema.options || {}));
  const unrecognizedOptions = Object.keys(options).filter(
    (optionName) => !supportedOptions.has(optionName)
  );
  if (!unrecognizedOptions.length) return;
  logDeprecation(
    'UNSUPPORTED_CLI_OPTIONS',
    `Detected unrecgonized CLI options: "--${unrecognizedOptions.join('", "--')}".\n` +
      'Starting with the next major, Serverless Framework will report them with a thrown error',
    { serviceConfig: configuration }
  );
};
