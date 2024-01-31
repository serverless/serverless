'use strict';

const globalOptions = require('./commands-options-schema');

module.exports = (options, { commandSchema }) => {
  const supportedNames = (() => {
    if (commandSchema) return Object.keys(commandSchema.options);
    return globalOptions;
  })();
  const result = Object.create(null);
  for (const name of supportedNames) result[name] = options[name] == null ? null : options[name];
  return result;
};
