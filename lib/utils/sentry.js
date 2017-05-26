const raven = require('raven');
const ci = require('ci-info');
const isTrackingDisabled = require('./isTrackingDisabled');
const getFrameworkId = require('./getFrameworkId');
const pkg = require('./../../package.json');

const DSN = 'https://cbb3655b343a49ee9a18494d0dd171a7:4b9ef9a2c5eb40379f30b5e6808d3814@sentry.io/165477';
const SLS_DISABLE_ERROR_TRACKING = process.env.SLS_DISABLE_ERROR_TRACKING === 'true';

function initializeErrorReporter() {
  // exit if tracking disabled or inside CI system
  if (SLS_DISABLE_ERROR_TRACKING || isTrackingDisabled() || ci.isCI) {
    return false;
  }

  // initialize Error tracking
  raven.config(DSN, {
    environment: 'production',
    autoBreadcrumbs: true,
    release: pkg.version,
    extra: {
      frameworkId: getFrameworkId(),
    },
  });

  raven.disableConsoleAlerts();

  raven.install();

  return true;
}

module.exports.initializeErrorReporter = initializeErrorReporter;

module.exports.raven = raven;
