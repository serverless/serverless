'use strict';

const { style } = require('@serverless/utils/log');
const log = require('./log');
const { serviceSlug, instanceSlug } = require('./utils');
const { getDashboardUrl } = require('./dashboard');
const { getPlatformClientWithAccessKey } = require('./client-utils');

module.exports.configureDeployProfile = async (ctx) => {
  const {
    provider,
    sls: {
      service: { app, org, service },
      processedInput: { options: cliOptions },
    },
  } = ctx;

  if (cliOptions['use-local-credentials']) {
    log.info('Skipping provider resolution, use-local-credentials option present');
    return;
  }
  const stage = cliOptions.stage || provider.getStage();
  const region = cliOptions.region || provider.getRegion();

  const sdk = await getPlatformClientWithAccessKey(org);

  let providerCredentials = {};
  try {
    if (!ctx.sls.service.orgUid) {
      const { orgUid } = await sdk.getOrgByName(ctx.sls.service.org);
      ctx.sls.service.orgUid = orgUid;
    }
    providerCredentials = await sdk.getProvidersByOrgServiceInstance(
      ctx.sls.service.orgUid,
      serviceSlug({ app, service }),
      instanceSlug({ app, service, stage, region })
    );
  } catch (e) {
    if (!e.statusCode === '404') {
      throw e;
    }
  }
  const providersConfigUrl = `${getDashboardUrl(ctx)}/providers`;

  if (providerCredentials.result) {
    const awsCredentials = providerCredentials.result.find(
      (result) => result.providerName === 'aws'
    );
    if (awsCredentials) {
      ctx.state.areProvidersUsed = true;
      ctx.provider.cachedCredentials = {
        dashboardProviderAlias: awsCredentials.alias,
        accessKeyId: awsCredentials.providerDetails.accessKeyId,
        secretAccessKey: awsCredentials.providerDetails.secretAccessKey,
        sessionToken: awsCredentials.providerDetails.sessionToken,
      };
      ctx.provider.cachedCredentials.region = ctx.provider.getRegion();
    }
  } else {
    log.notice(
      `Using local credentials. Add provider credentials via dashboard: ${style.link(
        providersConfigUrl
      )}`
    );
  }
};
