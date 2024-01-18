'use strict';

const open = require('open');
const { getPlatformClientWithAccessKey } = require('./client-utils');
const isAuthenticated = require('./is-authenticated');
const log = require('./log');

const dashboardUrl =
  process.env.SERVERLESS_PLATFORM_STAGE === 'dev'
    ? 'https://app.serverless-dev.com/'
    : 'https://app.serverless.com/';

const getServiceSpecificDashboardUrl = (ctx) => {
  const { service } = ctx.sls;
  return `${dashboardUrl}${service.org}/apps/${service.app}/${
    service.service
  }/${ctx.provider.getStage()}/${ctx.provider.getRegion()}`;
};

// Left as-is as it is a part of public API used e.g. in Framework directly
const getDashboardUrl = (ctx) => {
  if (!ctx.sls.enterpriseEnabled) return dashboardUrl;
  return getServiceSpecificDashboardUrl(ctx);
};

const getDashboardInteractUrl = (ctx) => {
  if (!ctx.sls.enterpriseEnabled) return null;
  return `${getDashboardUrl(ctx)}/interact`;
};

const getDashboardProvidersUrl = (ctx) => {
  if (!ctx.sls.enterpriseEnabled) return null;
  return `${getDashboardUrl(ctx)}/providers`;
};

const hasExistingDeployments = async (service, provider) => {
  try {
    const platformSdk = await getPlatformClientWithAccessKey(service.org);
    const deploymentsListResult = await platformSdk.frameworkDeployments.list({
      orgName: service.org,
      appName: service.app,
      regionName: provider.getRegion(),
      stageName: provider.getStage(),
      serviceName: service.service,
    });
    if (deploymentsListResult.items.length) {
      return true;
    }
  } catch (e) {
    log.info(`Encountered error when trying to check existing service deployments: ${e}`);
  }

  return false;
};

const dashboardHandler = async (ctx) => {
  const { service } = ctx.sls;

  if (!ctx.isDashboardEnabled) {
    log.notice.skip(
      'This service does not use the Serverless Dashboard. Run "serverless" to get started.'
    );
    return;
  }

  if (!isAuthenticated()) {
    log.notice.skip('Could not find logged in user. Run "serverless login" and try again.');
    return;
  }

  if (await hasExistingDeployments(service, ctx.provider)) {
    open(await getServiceSpecificDashboardUrl(ctx));
    return;
  }

  open(dashboardUrl);
};

module.exports = {
  dashboardHandler,
  getDashboardUrl,
  getDashboardInteractUrl,
  getDashboardProvidersUrl,
};
