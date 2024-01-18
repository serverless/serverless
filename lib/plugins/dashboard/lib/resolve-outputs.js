'use strict';

const { getPlatformClientWithAccessKey } = require('./client-utils');

module.exports = async ({ org, app, service, stage, region }) => {
  const sdk = await getPlatformClientWithAccessKey(org);
  const serviceData = await sdk.services.get({
    orgName: org,
    appName: app,
    serviceName: service,
  });

  const stageData = serviceData.stagesAndRegions[stage];
  if (!stageData) return {};
  const regionData = stageData[region];
  if (!regionData) return {};
  return regionData.outputs;
};
