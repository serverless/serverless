'use strict';

const { writeText } = require('@serverless/utils/log');
const renderOptionsHelp = require('./options');
const generateCommandUsage = require('./generate-command-usage');

module.exports = ({
  commandName,
  commandsSchema
}) => {
  const commandSchema = commandsSchema.get(commandName);

  if (commandSchema) {
    writeText(generateCommandUsage(commandName, commandSchema));
  }
  for (const [subCommandName, subCommandSchema] of commandsSchema) {
    if (!subCommandName.startsWith(`${commandName} `)) continue;
    writeText(generateCommandUsage(subCommandName, subCommandSchema));
  }
  if (commandSchema) renderOptionsHelp(Object.assign({}, commandSchema.options));

  writeText();
};
