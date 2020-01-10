'use strict';

const _ = require('lodash');
const yargsParser = require('yargs-parser');

const yargsOptions = {
  boolean: ['help', 'version', 'verbose'],
  string: ['config'],
  alias: { config: 'c', help: 'h', version: 'v' },
  configuration: { 'parse-numbers': false },
};

module.exports = _.memoize(inputArray => {
  const argv = yargsParser(inputArray, yargsOptions);

  const commands = [].concat(argv._);
  const options = _.omit(argv, ['_']);

  // Do not expose `false` defaults for booleans as it interfers with interactive CLI detection
  if (!options.help) {
    delete options.help;
    delete options.h;
  }
  if (!options.version) {
    delete options.version;
    delete options.v;
  }
  if (!options.verbose) delete options.verbose;

  return { commands, options };
});
