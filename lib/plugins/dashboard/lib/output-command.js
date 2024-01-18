'use strict';

const { isEmpty, isObject } = require('lodash');
const { writeText } = require('@serverless/utils/log');
const log = require('./log');
const ensureDashboardEnabled = require('./ensure-dashboard-enabled');
const resolveOutputs = require('./resolve-outputs');
const resolveOutput = require('./resolve-output');

const resolveInput = function (ctx) {
  ensureDashboardEnabled(ctx);
  const {
    provider,
    sls: {
      service: { app, org, service },
      processedInput: { options: cliOptions },
      classes: { Error: ServerlessError },
    },
  } = ctx;

  const serviceName = cliOptions.service || service;
  if (!serviceName) {
    throw new ServerlessError('Missing `service` setting', 'DASHBOARD_MISSING_SERVICE');
  }

  const stage = cliOptions.stage || provider.getStage();
  const region = cliOptions.region || provider.getRegion();

  return { app, org, stage, region, service: serviceName };
};

const stringifyValue = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((valueItem) => {
        return isObject(valueItem) ? JSON.stringify(valueItem) : valueItem;
      })
      .join(', ');
  }
  if (isObject(value)) return JSON.stringify(value);
  return value;
};

module.exports = {
  get: async (context) => {
    const { name } = context.sls.processedInput.options;
    if (!name) {
      throw new context.sls.classes.Error(
        'Missing `name` parameter',
        'DASHBOARD_MISSING_OUTPUT_NAME'
      );
    }
    const value = await (async () => {
      try {
        return await resolveOutput(name, resolveInput(context));
      } catch (error) {
        if (error.message.includes(' not found')) return null;
        throw error;
      }
    })();
    if (!value) {
      log.notice.skip(`No "${name}" output stored`);
    } else {
      writeText(stringifyValue(value));
    }
  },
  list: async (context) => {
    const outputs = await resolveOutputs(resolveInput(context));
    if (isEmpty(outputs)) {
      log.notice.skip('No outputs stored');
    } else {
      writeText(
        Object.entries(outputs).map(([name, value]) => `${name}: ${stringifyValue(value)}`)
      );
    }
  },
};
