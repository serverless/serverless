'use strict';

const { legacy, writeText } = require('@serverless/utils/log');
const resolveInput = require('../resolve-input');
const renderOptionsHelp = require('./options');

const generateCommandUsage = require('./generate-command-usage');

module.exports = (commandName) => {
  const { commandsSchema } = resolveInput();
  const commandSchema = commandsSchema.get(commandName);

  if (commandSchema) {
    legacy.write(`${generateCommandUsage(commandName, commandSchema)}\n`);
    writeText(generateCommandUsage(commandName, commandSchema, { isModern: true }));
  }
  for (const [subCommandName, subCommandSchema] of commandsSchema) {
    if (!subCommandName.startsWith(`${commandName} `)) continue;
    legacy.write(`${generateCommandUsage(subCommandName, subCommandSchema)}\n`);
    writeText(generateCommandUsage(subCommandName, subCommandSchema, { isModern: true }));
  }
  if (commandSchema) renderOptionsHelp(Object.assign({}, commandSchema.options));

  legacy.consoleLog('');
  writeText();
};
