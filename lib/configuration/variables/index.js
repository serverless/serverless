// Resolves all non instance dependent variables in a provided configuration
// This util is not used in Serverless process flow, but is handy for side resolution of variables

'use strict';

const ensureString = require('type/string/ensure');
const ensurePlainObject = require('type/plain-object/ensure');
const ServerlessError = require('../../serverless-error');
const resolveMeta = require('./resolve-meta');
const resolve = require('./resolve');

const defaultSources = {
  env: require('./sources/env'),
  file: require('./sources/file'),
  opt: require('./sources/opt'),
  self: require('./sources/self'),
  strToBool: require('./sources/str-to-bool'),
  sls: require('./sources/instance-dependent/get-sls')(),
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

module.exports = async ({ serviceDir, servicePath, configuration, options, sources = null }) => {
  serviceDir = ensureString(serviceDir || servicePath);
  ensurePlainObject(configuration);
  options = ensurePlainObject(options, { default: {} });

  const variablesMeta = resolveMeta(configuration);
  reportEventualErrors(variablesMeta);

  if (!sources) sources = defaultSources;
  await resolve({
    serviceDir,
    configuration,
    variablesMeta,
    sources,
    options,
    fulfilledSources: new Set(Object.keys(sources)),
  });

  reportEventualErrors(variablesMeta);
};
