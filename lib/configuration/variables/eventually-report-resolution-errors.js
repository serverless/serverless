'use strict';

const path = require('path');
const { log, legacy } = require('@serverless/utils/log');
const ServerlessError = require('../../serverless-error');
const resolveCliInput = require('../../cli/resolve-input');
const logDeprecation = require('../../utils/logDeprecation');

module.exports = (configurationPath, configuration, variablesMeta) => {
  const resolutionErrors = new Set(
    Array.from(variablesMeta.values(), ({ error }) => error).filter(Boolean)
  );

  if (!resolutionErrors.size) return false;

  if (resolveCliInput().isHelpRequest) {
    legacy.log(
      'Resolution of service configuration failed when resolving variables: ' +
        `${Array.from(resolutionErrors, (error) => `\n  - ${error.message}`)}\n`,
      { color: 'orange' }
    );
    log.warning(
      'Resolution of service configuration failed when resolving variables: ' +
        `${Array.from(resolutionErrors, (error) => `\n  - ${error.message}`)}\n`
    );
  } else {
    if (configuration.variablesResolutionMode) {
      throw new ServerlessError(
        `Cannot resolve ${path.basename(
          configurationPath
        )}: Variables resolution errored with:${Array.from(
          resolutionErrors,
          (error) => `\n  - ${error.message}`
        )}`,
        'VARIABLES_RESOLUTION_ERROR'
      );
    }
    logDeprecation(
      'NEW_VARIABLES_RESOLVER',
      'Variables resolver reports following resolution errors:' +
        `${Array.from(resolutionErrors, (error) => `\n  - ${error.message}`)}\n` +
        'From a next major this will be communicated with a thrown error.\n' +
        'Set "variablesResolutionMode: 20210326" in your service config, ' +
        'to adapt to new behavior now',
      { serviceConfig: configuration }
    );
  }

  return true;
};
