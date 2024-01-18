'use strict';

const _ = require('lodash');
const memoizee = require('memoizee');
const { serviceSlug, instanceSlug } = require('./utils');
const { getPlatformClientWithAccessKey } = require('./client-utils');
const isAuthenticated = require('./is-authenticated');

const mapDashboardParamType = (paramType) => {
  // "paramType" may not be guaranteed for old deprecated params stored on deployment profile
  if (!paramType) return 'dashboardService';

  switch (paramType) {
    case 'services':
      return 'dashboardService';
    case 'instances':
      return 'dashboardServiceStage';
    default:
      throw new Error(`Unexpected param type ${paramType}`);
  }
};

const resolveDashboardParams = memoizee(
  async (data) => {
    const dashboardParams = new Map();
    if (!data) return dashboardParams;
    const { org, app, service, stage, region } = data;
    const sdk = await getPlatformClientWithAccessKey(org);

    const { orgUid } = await sdk.getOrgByName(org);
    const parametersResponse = await sdk.getParamsByOrgServiceInstance(
      orgUid,
      serviceSlug({ app, service }),
      instanceSlug({ app, service, stage, region })
    );

    if (parametersResponse.result && parametersResponse.result.length) {
      for (const { paramName, paramValue, paramType } of parametersResponse.result) {
        dashboardParams.set(paramName, {
          value: paramValue,
          type: mapDashboardParamType(paramType),
        });
      }
    }

    return dashboardParams;
  },
  {
    promise: true,
    normalizer: ([data]) => {
      if (data == null) return null;
      const { org, app, service, stage, region } = data;
      return JSON.stringify({ org, app, service, stage, region });
    },
  }
);

const resolveInput = function (context) {
  if (!isAuthenticated()) return null;
  const {
    provider,
    sls: {
      service: { app, org },
      processedInput: { options: cliOptions },
    },
  } = context;

  if (!app || !org) return null;
  const stage = cliOptions.stage || provider.getStage();
  const region = cliOptions.region || provider.getRegion();
  const service = context.sls.service.service || cliOptions.service;
  if (!service) return null;
  return { org, app, service, stage, region };
};

module.exports = memoizee(async (context) => {
  const stage = context.provider.getStage();
  const configParams = new Map(
    Object.entries(_.get(context.sls.configurationInput, 'params') || {})
  );

  const resultParams = Object.create(null);

  if (context.sls.processedInput.options.param) {
    const regex = /(?<key>[^=]+)=(?<value>.+)/;
    for (const item of context.sls.processedInput.options.param) {
      const res = item.match(regex);
      if (!res) {
        throw new context.sls.classes.Error(
          `Encountered invalid "--param" CLI option value: "${item}". Supported format: "--param='<key>=<val>'"`,
          'INVALID_CLI_PARAM_FORMAT'
        );
      }
      resultParams[res.groups.key] = { value: res.groups.value.trimEnd(), type: 'cli' };
    }
  }

  for (const [name, value] of Object.entries(configParams.get(stage) || {})) {
    if (value == null) continue;
    if (resultParams[name] != null) continue;
    resultParams[name] = { value, type: 'configServiceStage' };
  }
  const dashboardParams = await resolveDashboardParams(resolveInput(context));
  for (const [name, meta] of dashboardParams) {
    if (meta.type !== 'dashboardServiceStage') continue;
    if (resultParams[name] != null) resultParams[name].isOverriden = true;
    else resultParams[name] = meta;
  }

  for (const [name, value] of new Map(Object.entries(configParams.get('default') || {}))) {
    if (value == null) continue;
    if (resultParams[name] != null) continue;
    resultParams[name] = { value, type: 'configService' };
  }

  for (const [name, meta] of dashboardParams) {
    if (meta.type !== 'dashboardService') continue;
    if (resultParams[name] != null) resultParams[name].isOverriden = true;
    else resultParams[name] = meta;
  }
  return resultParams;
});
