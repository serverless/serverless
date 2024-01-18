'use strict';

const { getPlatformClientWithAccessKey } = require('./client-utils');

module.exports = async (outputName, { org, app, service, stage, region }) => {
  const sdk = await getPlatformClientWithAccessKey(org);
  const result = await sdk.services.getStateVariable({
    variableName: outputName,
    orgName: org,
    appName: app,
    serviceName: service,
    stageName: stage,
    regionName: region,
  });
  return result.value;
};
