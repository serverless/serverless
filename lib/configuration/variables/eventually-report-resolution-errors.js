'use strict';

const path = require('path');
const log = require('@serverless/utils/log');
const ServerlessError = require('../../serverless-error');
const isHelpRequest = require('../../cli/is-help-request');
const logDeprecation = require('../../utils/logDeprecation');

module.exports = (configurationPath, configuration, variablesMeta) => {
  const resolutionErrors = new Set(
    Array.from(variablesMeta.values(), ({ error }) => error).filter(Boolean)
  );

  if (!resolutionErrors.size) return false;

  if (isHelpRequest()) {
    log(
      'Resolution of service configuration failed when resolving variables: ' +
        `${Array.from(resolutionErrors, (error) => `\n  - ${error.message}`)}\n`,
      { color: 'orange' }
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
        'From a next major it we will be communicated with a thrown error.\n' +
        'Set "variablesResolutionMode: 20210219" in your service config, ' +
        'to adapt to this behavior now',
      { serviceConfig: configuration }
    );
    // Hack to not duplicate the warning with similar deprecation
    logDeprecation.triggeredDeprecations.add('VARIABLES_ERROR_ON_UNRESOLVED');
  }

  return true;
};
