const raven = require('raven');
const ci = require('ci-info');
const configUtils = require('./config');
const pkg = require('./../../package.json');

const DSN = 'https://cbb3655b343a49ee9a18494d0dd171a7:4b9ef9a2c5eb40379f30b5e6808d3814@sentry.io/165477';
const SLS_DISABLE_ERROR_TRACKING = true;
const IS_CI = ci.isCI;

function initializeErrorReporter(invocationId) {
  const config = configUtils.getConfig();
  const trackingDisabled = config.trackingDisabled;

  // exit if tracking disabled or inside CI system
  if (SLS_DISABLE_ERROR_TRACKING || trackingDisabled || IS_CI) {
    // console.log('tracking off')
    return false;
  }

  // initialize Error tracking
  raven.config(DSN, {
    environment: 'production',
    autoBreadcrumbs: true,
    release: pkg.version,
    extra: {
      frameworkId: config.frameworkId,
      invocationId,
    },
  });

  if (config.userId) {
    raven.setContext({
      user: {
        id: config.userId,
      },
    });
  }

  raven.disableConsoleAlerts();

  raven.install();

  return true;
}

module.exports.initializeErrorReporter = initializeErrorReporter;

module.exports.raven = raven;
