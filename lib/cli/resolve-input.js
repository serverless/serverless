// CLI params parser, to be used before we have deducted what commands and options are supported in given context

'use strict';

const ensureMap = require('type/map/ensure');
const memoizee = require('memoizee');
const parseArgs = require('./parse-args');

const baseArgsSchema = {
  boolean: new Set(['help', 'help-interactive', 'use-local-credentials', 'v', 'version']),
  string: new Set(['app', 'config', 'org', 'stage']),
  alias: new Map([
    ['c', 'config'],
    ['h', 'help'],
  ]),
};

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

  // Ideally no options should be passed before command (to know what options are supported,
  // and whether they're boolean or not, we need to know command name upfront).
  // Still so far we (kind of) supported such notation and we need to maintain it in current major.
  // Thefore at first resolution stage we use schema that recognizes just some popular options
  let options = parseArgs(args, baseArgsSchema);
  let commands = options._;
  delete options._;

  let command = commands.join(' ');

  // Having command potentially resolved, resolve options again with help of the command schema
  let commandSchema = commandsSchema.get(command);
  while (commandSchema) {
    const resolvedOptions = parseArgs(args, resolveArgsSchema(commandSchema.options));
    const resolvedCommand = resolvedOptions._.join(' ');
    if (resolvedCommand === command) {
      options = resolvedOptions;
      commands = options._;
      delete options._;
      break;
    }
    // Unlikely scenario, where after applying the command schema different command resolves
    // It can happen only in cases where e.g. for "sls deploy --force  function -f foo"
    // we initially assume "deploy" command, while after applying "deploy" command schema it's
    // actually a "deploy function" command that resolves
    command = resolvedCommand;
    commandSchema = commandsSchema.get(resolvedCommand);
  }

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
    return result;
  }

  const argsString = args.join(' ');
  if (command && argsString !== command && !argsString.startsWith(`${command} `)) {
    // Some options were passed before command name (e.g. "sls -v deploy"), deprecate such usage
    require('../utils/logDeprecation')(
      'CLI_OPTIONS_BEFORE_COMMAND',
      '"serverless" command options are expected to follow command and not be put before the command.\n' +
        'Starting from next major Serverless will no longer support the latter form.'
    );
  }

  return result;
});
