'use strict';

const resolveInput = require('../resolve-input');
const renderOptionsHelp = require('./options');

const generateCommandUsage = require('./generate-command-usage');

module.exports = (commandName) => {
  const { commandsSchema } = resolveInput();
  const commandSchema = commandsSchema.get(commandName);

  if (commandSchema) process.stdout.write(`${generateCommandUsage(commandName, commandSchema)}\n`);
  for (const [subCommandName, subCommandSchema] of commandsSchema) {
    if (!subCommandName.startsWith(`${commandName} `)) continue;
    process.stdout.write(`${generateCommandUsage(subCommandName, subCommandSchema)}\n`);
  }
  if (commandSchema) renderOptionsHelp(Object.assign({}, commandSchema.options));

  process.stdout.write('\n');
};
