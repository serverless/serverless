// CLI params parser, to be used before we have deducted what commands and options are supported in given context

'use strict';

const memoizee = require('memoizee');
const parseArgs = require('./parse-args');

const customSAliasCommands = new Set(['config credentials'], ['config tabcompletion install']);

module.exports = memoizee(() => {
  const args = process.argv.slice(2);

  const baseArgsSchema = {
    boolean: new Set(['help', 'help-interactive', 'v', 'version']),
    string: new Set(['app', 'config', 'org', 'stage']),
    alias: new Map([
      ['c', 'config'],
      ['h', 'help'],
    ]),
  };

  let options = parseArgs(args, baseArgsSchema);

  const command = options._.join(' ');
  if (!command) {
    // Ideally we should output version info in whatever context "--version" or "-v" params
    // are used. Still "-v" is defined also as a "--verbose" alias for some commands.
    // Support for "--verbose" is expected to go away with
    // https://github.com/serverless/serverless/issues/1720
    // Until that's addressed we can recognize "-v" only with no commands
    baseArgsSchema.boolean.delete('v');
    baseArgsSchema.alias.set('v', 'version');
  }
  if (!customSAliasCommands.has(command)) {
    // Unfortunately, there are few command for which "-s" aliases different param than "--stage"
    // This handling ensures we do not break those commands
    baseArgsSchema.alias.set('s', 'stage');
  }

  options = parseArgs(args, baseArgsSchema);

  const commands = options._;
  delete options._;
  return { commands, options };
});
