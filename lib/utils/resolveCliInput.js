'use strict';

const _ = require('lodash');
const minimist = require('minimist');

module.exports = _.memoize(inputArray => {
  const base64Encode = valueStr => Buffer.from(valueStr).toString('base64');

  const toBase64Helper = value => {
    const valueStr = value.toString();
    if (valueStr.startsWith('-')) {
      if (valueStr.indexOf('=') !== -1) {
        // do not encode argument names, since those are parsed by
        // minimist, and thus need to be there unconverted:
        const splitted = valueStr.split('=', 2);
        // splitted[1] values, however, need to be encoded, since we
        // decode them later back to utf8
        const encodedValue = base64Encode(splitted[1]);
        return `${splitted[0]}=${encodedValue}`;
      }
      // do not encode plain flags, for the same reason as above
      return valueStr;
    }
    return base64Encode(valueStr);
  };

  const decodedArgsHelper = arg => {
    if (_.isString(arg)) {
      return Buffer.from(arg, 'base64').toString();
    } else if (_.isArray(arg)) {
      return _.map(arg, decodedArgsHelper);
    }
    return arg;
  };

  // encode all the options values to base64
  const valuesToParse = _.map(inputArray, toBase64Helper);

  // parse the options with minimist
  const argvToParse = minimist(valuesToParse);

  // decode all values back to utf8 strings
  const argv = _.mapValues(argvToParse, decodedArgsHelper);

  const commands = [].concat(argv._);
  const options = _.omit(argv, ['_']);

  return { commands, options };
});
