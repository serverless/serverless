'use strict';

const { isEmpty } = require('lodash');
const { writeText, style } = require('@serverless/utils/log');
const log = require('./log');
const resolveParams = require('./resolve-params');

const overridenByCliMessage =
  'This Serverless Console parameter is overridden by provided CLI param';
const overridenByConfigMessage =
  'This Serverless Console parameter is overridden in service configuration';

module.exports = {
  get: async (context) => {
    const cliOptions = context.sls.processedInput.options;
    if (!context.sls.service.service && !cliOptions.service) {
      throw new context.sls.classes.Error(
        'command needs to be run in service context or "service" param needs to be provided',
        'PARAMS_MISSING_SERVICE_NAME'
      );
    }
    const { name } = cliOptions;
    if (!name) {
      throw new context.sls.classes.Error(
        'Missing `name` parameter',
        'DASHBOARD_MISSING_PARAM_NAME'
      );
    }
    const params = await resolveParams(context);
    if (!params[name]) {
      log.notice.skip(`No "${name}"" parameter stored`);
    } else {
      writeText(params[name].value);
      if (params[name].isOverriden) {
        const message =
          params[name].type === 'cli' ? overridenByCliMessage : overridenByConfigMessage;
        log.notice(style.aside(message));
      }
    }
  },
  list: async (context) => {
    const cliOptions = context.sls.processedInput.options;
    if (!context.sls.service.service && !cliOptions.service) {
      throw new context.sls.classes.Error(
        'command needs to be run in service context or "service" param needs to be provided',
        'PARAMS_MISSING_SERVICE_NAME'
      );
    }
    const params = await resolveParams(context);
    if (isEmpty(params)) {
      log.notice.skip('No parameters stored');
    } else {
      for (const [name, { value, isOverriden, type }] of Object.entries(params)) {
        writeText(`${name}: ${value}`);
        if (isOverriden) {
          const message = `   ${type === 'cli' ? overridenByCliMessage : overridenByConfigMessage}`;
          log.notice(style.aside(message));
        }
      }
    }
  },
};
