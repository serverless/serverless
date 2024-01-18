'use strict';

const _ = require('lodash');
const ensureString = require('type/string/ensure');
const resolveOutput = require('./resolve-output');
const resolveParams = require('./resolve-params');
const throwAuthError = require('./throw-auth-error');

// functions for new way of getting variables
const getValueFromDashboardParams = (context) => async (paramName) => {
  const params = await resolveParams(context);
  return params[paramName] ? params[paramName].value : null;
};

const getValueFromDashboardOutputs = (ctx) => async (outputAddress) => {
  const variableParts = outputAddress.split(':');
  let service;
  let key;
  let app = ctx.sls.service.app;
  let stage = ctx.provider.getStage();
  let region = ctx.provider.getRegion();
  if (variableParts.length === 1) {
    service = variableParts[0].split('.', 1)[0];
    key = variableParts[0].slice(service.length);
  } else if (variableParts.length === 4) {
    service = variableParts[3].split('.', 1)[0];
    key = variableParts[3].slice(service.length);
    if (variableParts[0]) {
      app = variableParts[0];
    }
    if (variableParts[1]) {
      stage = variableParts[1];
    }
    if (variableParts[2]) {
      region = variableParts[2];
    }
  } else {
    throw new ctx.sls.classes.Error(
      '`${${variableString}}` does not conform to syntax ${outputs:service.key} or ${outputs:app:stage:region:service.key}'
    );
  }
  const outputName = key.split('.')[1];
  const subkey = key.slice(outputName.length + 2);
  if (!ctx.sls.enterpriseEnabled) throwAuthError(ctx.sls);
  const value = await (async () => {
    try {
      return await resolveOutput(outputName, {
        service,
        app,
        org: ctx.sls.service.org,
        stage,
        region,
      });
    } catch (error) {
      if (error.message.includes(' not found')) return null;
      throw error;
    }
  })();
  if (subkey) {
    return _.get(value, subkey);
  }
  return value;
};

module.exports = {
  async paramResolve({ address }) {
    if (!address) {
      throw new this.sls.classes.Error(
        'Missing address argument in variable "param" source',
        'MISSING_PARAM_SOURCE_ADDRESS'
      );
    }
    address = ensureString(address, {
      Error: this.sls.classes.Error,
      errorMessage: 'Non-string address argument in variable "param" source: %v',
      errorCode: 'INVALID_PARAM_SOURCE_ADDRESS',
    });
    const value = await getValueFromDashboardParams(this)(address);
    const result = { value };

    if (value == null) {
      result.eventualErrorMessage = `The param "${address}" cannot be resolved from CLI options or stage params${
        this.sls.service.org && this.sls.service.app ? ' or Serverless Dashboard' : ''
      }. If you are using Serverless Framework Compose, make sure to run commands via Compose so that all parameters can be resolved`;
    }
    return result;
  },
  async outputResolve({ address }) {
    if (!address) {
      throw new this.sls.classes.Error(
        'Missing address argument in variable "output" source',
        'MISSING_OUTPUT_SOURCE_ADDRESS'
      );
    }
    address = ensureString(address, {
      Error: this.sls.classes.Error,
      errorMessage: 'Non-string address argument in variable "output" source: %v',
      errorCode: 'INVALID_OUTPUT_SOURCE_ADDRESS',
    });
    return {
      value: await getValueFromDashboardOutputs(this)(address),
    };
  },
};
