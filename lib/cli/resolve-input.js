// CLI params parser, to be used before we have deducted what commands and options are supported in given context

'use strict';

const memoizee = require('memoizee');
const parseArgs = require('./parse-args');

const baseArgsSchema = {
  boolean: new Set(['version', 'help', 'help-interactive', 'v']),
  string: new Set(['config']),
  alias: new Map([
    ['c', 'config'],
    ['h', 'help'],
  ]),
};
module.exports = memoizee(() => {
  const args = process.argv.slice(2);
  const options = parseArgs(args, baseArgsSchema);
  const commands = options._;
  delete options._;
  if (!commands.length && options.v && !options.version) {
    // Ideally we should output version info in whatever context "--version" or "-v" params
    // are used. Still "-v" is defined also as a "--verbose" alias for some commands.
    // Support for "--verbose" is expected to go away with
    // https://github.com/serverless/serverless/issues/1720
    // Until that's addressed we can recognize "-v" only with no commands
    options.version = true;
    delete options.v;
  }
  return { commands, options };
});
