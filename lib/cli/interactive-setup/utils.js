'use strict';

const inquirer = require('@serverless/utils/inquirer');
const ServerlessError = require('../../serverless-error');
const resolveProviderCredentials = require('@serverless/dashboard-plugin/lib/resolveProviderCredentials');
const resolveStage = require('../../utils/resolve-stage');
const resolveRegion = require('../../utils/resolve-region');

module.exports = {
  confirm: async (message, options = {}) => {
    const name = options.name || 'isConfirmed';
    return (
      await inquirer.prompt({
        message,
        type: 'confirm',
        name,
      })
    )[name];
  },
  doesServiceInstanceHaveLinkedProvider: async ({ configuration, options }) => {
    const region = resolveRegion({ configuration, options });
    const stage = resolveStage({ configuration, options });
    let result;
    try {
      result = await resolveProviderCredentials({ configuration, region, stage });
    } catch (err) {
      if (err.statusCode && err.statusCode >= 500) {
        throw new ServerlessError(
          'Dashboard service is currently unavailable, please try again later',
          'DASHBOARD_UNAVAILABLE'
        );
      }
      throw err;
    }

    return Boolean(result);
  },
};
