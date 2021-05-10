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
  const { command, options, commandSchema, commandsSchema, isContainerCommand, isHelpRequest } =
    resolveInput();

  if (!commandSchema && !isContainerCommand) {
    throw new ServerlessError(
      `Serverless command "${command}" not found.` +
        `${getCommandSuggestion(command, commandsSchema)} ` +
        'Run "serverless help" for a list of all available commands.',
      'UNRECOGNIZED_CLI_COMMAND'
    );
  }
  if (isHelpRequest) return;
  const supportedOptions = new Set(Object.keys((commandSchema && commandSchema.options) || {}));
  const unrecognizedOptions = Object.keys(options).filter(
    (optionName) => !supportedOptions.has(optionName)
  );
  if (unrecognizedOptions.length) {
    logDeprecation(
      'UNSUPPORTED_CLI_OPTIONS',
      `Detected unrecognized CLI options: "--${unrecognizedOptions.join('", "--')}".\n` +
        'Starting with the next major, Serverless Framework will report them with a thrown error',
      { serviceConfig: configuration }
    );
  }
  if (isContainerCommand) return;
  if (commandSchema.serviceDependencyMode === 'required' && !configuration) {
    throw new ServerlessError(
      'This command can only be run in a Serverless service directory. ' +
        "Make sure to reference a valid config file in the current working directory if you're using a custom config file",
      'MISSING_SERVICE_CONTEXT'
    );
  }
  const missingOptions = [];
  for (const [optionName, { required }] of Object.entries(commandSchema.options || {})) {
    if (!required) continue;
    if (options[optionName] == null) missingOptions.push(optionName);
  }

  if (missingOptions.length) {
    throw new ServerlessError(
      `Serverless command "${command}" requires "--${missingOptions.join('", "--')}" option${
        missingOptions.length > 1 ? 's' : ''
      }. Run "serverless ${command} --help" for more info`,
      'MISSING_REQUIRED_CLI_OPTION'
    );
  }
};
