const raven = require('raven');
const ci = require('ci-info');
const configUtils = require('./config');
const pkg = require('./../../package.json');
const readFileIfExists = require('./fs/readFileIfExists');
const getTrackingConfigFileName = require('./getTrackingConfigFileName');
const path = require('path');
const BbPromise = require('bluebird');

const SLS_DISABLE_ERROR_TRACKING = true;
const IS_CI = ci.isCI;

function initializeErrorReporter(invocationId) {
  const trackingConfigFilePath = path.join(__dirname, '..', '..', getTrackingConfigFileName());
  return readFileIfExists(trackingConfigFilePath).then(trackingConfig => {
    const config = configUtils.getConfig();
    const trackingDisabled = config.trackingDisabled;
    // exit if tracking disabled or inside CI system
    if (!trackingConfig || SLS_DISABLE_ERROR_TRACKING || trackingDisabled || IS_CI) {
      return BbPromise.resolve();
    }

    const DSN = trackingConfig.sentryDSN;

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

    return BbPromise.resolve();
  });
}

module.exports.initializeErrorReporter = initializeErrorReporter;

module.exports.raven = raven;
