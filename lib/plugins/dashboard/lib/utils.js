'use strict';
function serviceSlug({ app, service }) {
  return `appName|${app}|serviceName|${service}`;
}
function instanceSlug({ app, service, stage, region }) {
  return `appName|${app}|serviceName|${service}|stage|${stage}|region|${region}`;
}

function upperFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pickResourceType(template, resourcesType) {
  const resources = [];
  for (const key of Object.keys(template.Resources)) {
    const resource = template.Resources[key];
    if (resource.Type === resourcesType) {
      resources.push({
        key,
        resource,
      });
    }
  }
  return resources;
}

const API_GATEWAY_FILTER_PATTERN = '"SLS_ACCESS_LOG"';
const API_GATEWAY_V2_FILTER_PATTERN = '"SLS_HTTP_API_LOG"';
const LAMBDA_FILTER_PATTERN = '?"REPORT RequestId: " ?"SERVERLESS_ENTERPRISE"';
const API_GATEWAY_LOG_FORMAT = {
  requestTime: '$context.requestTime',
  requestId: '$context.requestId',
  apiId: '$context.apiId',
  resourceId: '$context.resourceId',
  resourcePath: '$context.resourcePath',
  path: '$context.path',
  httpMethod: '$context.httpMethod',
  status: '$context.status',
  authLatency: '$context.authorizer.integrationLatency',
  integrationLatency: '$context.integrationLatency',
  integrationStatus: '$context.integrationStatus',
  responseLatency: '$context.responseLatency',
  responseLength: '$context.responseLength',
  errorMessage: '$context.error.message',
  format: 'SLS_ACCESS_LOG',
  version: '1.0.0',
};
const API_GATEWAY_V2_LOG_FORMAT = {
  requestTime: '$context.requestTime',
  requestId: '$context.requestId',
  apiId: '$context.apiId',
  resourcePath: '$context.routeKey',
  path: '$context.path',
  httpMethod: '$context.httpMethod',
  stage: '$context.stage',
  status: '$context.status',
  integrationStatus: '$context.integrationStatus',
  integrationLatency: '$context.integrationLatency',
  responseLatency: '$context.responseLatency',
  responseLength: '$context.responseLength',
  errorMessage: '$context.error.message',
  format: 'SLS_HTTP_API_LOG',
  version: '1.0.0',
};

module.exports = {
  upperFirst,
  pickResourceType,
  serviceSlug,
  instanceSlug,
  API_GATEWAY_FILTER_PATTERN,
  API_GATEWAY_V2_FILTER_PATTERN,
  LAMBDA_FILTER_PATTERN,
  API_GATEWAY_LOG_FORMAT,
  API_GATEWAY_V2_LOG_FORMAT,
};
