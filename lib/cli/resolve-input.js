// CLI params parser, to be used before we have deducted what commands and options are supported in given context

'use strict';

const ensureMap = require('type/map/ensure');
const memoizee = require('memoizee');
const parseArgs = require('./parse-args');
const globalOptionsSchema = require('./commands-schema/common-options/global');

const isParamName = RegExp.prototype.test.bind(require('./param-reg-exp'));

const resolveArgsSchema = (commandOptionsSchema) => {
  const options = { boolean: new Set(), string: new Set(), alias: new Map(), multiple: new Set() };
  for (const [name, optionSchema] of Object.entries(commandOptionsSchema)) {
    switch (optionSchema.type) {
      case 'boolean':
        options.boolean.add(name);
        break;
      case 'multiple':
        options.multiple.add(name);
        break;
      case 'string':
        options.string.add(name);
        break;
      default:
    }
    if (optionSchema.shortcut) options.alias.set(optionSchema.shortcut, name);
  }
  return options;
};

module.exports = memoizee((commandsSchema = require('./commands-schema')) => {
  commandsSchema = ensureMap(commandsSchema);
  const args = process.argv.slice(2);
  const firstParamIndex = args.findIndex(isParamName);

  const commands = args.slice(0, firstParamIndex === -1 ? Infinity : firstParamIndex);
  const command = commands.join(' ');
  const commandSchema = commandsSchema.get(command);
  const options = parseArgs(
    args.slice(firstParamIndex === -1 ? Infinity : firstParamIndex),
    resolveArgsSchema(commandSchema ? commandSchema.options : globalOptionsSchema)
  );
  delete options._;

  const result = { commands, options, command, commandSchema, commandsSchema };
  if (!commandSchema) {
    result.isContainerCommand = Array.from(commandsSchema.keys()).some((commandName) =>
      commandName.startsWith(`${command} `)
    );
    if (result.isContainerCommand) {
      result.isHelpRequest = true;
      return result;
    }
  }

  if (
    (!command && options['help-interactive']) ||
    options.help ||
    options.version ||
    command === 'help'
  ) {
    result.isHelpRequest = true;
  }

  return result;
});
