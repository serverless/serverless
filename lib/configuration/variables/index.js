/*
 * NOTE: NOT used in the main Serverless process flow.
 *
 * This utility module resolves all non-instance dependent variables in a
 * provided configuration. Although it's not used in the main Serverless
 * process flow, it's useful for side resolution of variables.
 *
 * The module imports necessary dependencies and defines default sources for
 * variable resolution, including environment variables, file sources, options,
 * self references, string-to-boolean conversions, and Serverless instance data.
 *
 * It also includes a function to report any errors that occur during variable
 * resolution, throwing a ServerlessError with a detailed message if any errors
 * are found.
 *
 * The module exports an asynchronous function that takes a configuration object
 * as input, which includes the service directory, service path, and configuration.
 */

import ensureString from 'type/string/ensure.js';
import ensurePlainObject from 'type/plain-object/ensure.js';
import ServerlessError from '../../serverless-error.js';
import resolveMeta from './resolve-meta.js';
import resolve from './resolve.js';
import env from './sources/env.js';
import file from './sources/file.js';
import opt from './sources/opt.js';
import self from './sources/self.js';
import strToBool from './sources/str-to-bool.js';
import sls from './sources/instance-dependent/get-sls.js';

const defaultSources = {
  env,
  file,
  opt,
  self,
  strToBool,
  sls: sls(),
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

export default async ({ serviceDir, servicePath, configuration, options, sources = null }) => {
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
