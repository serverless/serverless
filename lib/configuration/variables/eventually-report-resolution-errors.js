'use strict';

const path = require('path');
const { log } = require('@serverless/utils/log');
const ServerlessError = require('../../serverless-error');
const resolveCliInput = require('../../cli/resolve-input');

module.exports = (configurationPath, configuration, variablesMeta) => {
  const resolutionErrors = new Set(
    Array.from(variablesMeta.values(), ({ error }) => error).filter(Boolean)
  );

  if (!resolutionErrors.size) return false;

  if (resolveCliInput().isHelpRequest) {
    log.warning(
      'Resolution of service configuration failed when resolving variables: ' +
        `${Array.from(resolutionErrors, (error) => `\n  - ${error.message}`)}\n`
    );
    return true;
  }

  throw new ServerlessError(
    `Cannot resolve ${path.basename(
      configurationPath
    )}: Variables resolution errored with:${Array.from(
      resolutionErrors,
      (error) => `\n  - ${error.message}`
    )}`,
    'VARIABLES_RESOLUTION_ERROR'
  );
};
