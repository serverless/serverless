// Resolves all non instance dependent variables in a provided configuraton
// This util is not used in Serveless process flow, but is handy for side resolution of variables

'use strict';

const ensureString = require('type/string/ensure');
const ensurePlainObject = require('type/plain-object/ensure');
const ServerlessError = require('../../serverless-error');
const resolveMeta = require('./resolve-meta');
const resolve = require('./resolve');

const sources = {
  env: require('./sources/env'),
  file: require('./sources/file'),
  opt: require('./sources/opt'),
  self: require('./sources/self'),
  strToBool: require('./sources/str-to-bool'),
};

const reportEventualErrors = (variablesMeta) => {
  const resolutionErrors = new Set(
    Array.from(variablesMeta.values(), ({ error }) => error).filter(Boolean)
  );

  if (!resolutionErrors.size) return;

  throw new ServerlessError(
    `Variables resolution errored with:${Array.from(
      resolutionErrors,
      (error) => `\n  - ${error.message}`
    )}`,
    'VARIABLES_RESOLUTION_ERROR'
  );
};

module.exports = async ({ serviceDir, servicePath, configuration, options }) => {
  // TODO: Remove support for `servicePath` with next major
  serviceDir = ensureString(serviceDir || servicePath);
  ensurePlainObject(configuration);
  options = ensurePlainObject(options, { default: {} });

  const variablesMeta = resolveMeta(configuration);
  reportEventualErrors(variablesMeta);

  await resolve({
    serviceDir,
    configuration,
    variablesMeta,
    sources,
    options,
    fulfilledSources: new Set(['env', 'file', 'opt', 'self', 'strToBool']),
  });

  reportEventualErrors(variablesMeta);
};
