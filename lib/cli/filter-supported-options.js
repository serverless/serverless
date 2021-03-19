'use strict';

const serviceOptionsNames = Object.keys(require('./commands-schema/common-options/service'));
const awsServiceOptionsNames = Object.keys(require('./commands-schema/common-options/aws-service'));

module.exports = (options, { commandSchema, providerName }) => {
  const supportedNames = (() => {
    if (commandSchema) return Object.keys(commandSchema.options);
    return providerName === 'aws' ? awsServiceOptionsNames : serviceOptionsNames;
  })();
  const result = Object.create(null);
  for (const name of supportedNames) result[name] = options[name] == null ? null : options[name];
  return result;
};
