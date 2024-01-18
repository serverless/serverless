'use strict';

const { getPlatformClientWithAccessKey } = require('./client-utils');

module.exports = async (ctx) => {
  if (
    !ctx.sls.service.custom ||
    !ctx.sls.service.custom.enterprise ||
    !ctx.sls.service.custom.enterprise.collectLambdaLogs
  ) {
    return;
  }
  const sdk = await getPlatformClientWithAccessKey(ctx.sls.service.org);
  await sdk.logDestinations.remove({
    appUid: ctx.sls.service.appUid,
    orgUid: ctx.sls.service.orgUid,
    serviceName: ctx.sls.service.getServiceName(),
    stageName: ctx.provider.getStage(),
    regionName: ctx.provider.getRegion(),
  });
};
