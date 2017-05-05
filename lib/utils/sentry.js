const raven = require('raven');
const pkg = require('./../../package.json');

const noSentry = process.env.SERVERLESS_DISABLE_DEBUG === 'false';
const DSN = 'https://cbb3655b343a49ee9a18494d0dd171a7:4b9ef9a2c5eb40379f30b5e6808d3814@sentry.io/165477';

function initializeErrorReporter() {
  // if (!fileExistsSync(statsDisabledFilePath)) {
  //  return false
  // }

  // initialize Error tracking
  raven.config(noSentry ? false : DSN, {
    environment: 'production',
    autoBreadcrumbs: true,
    release: pkg.version,
  });

  raven.disableConsoleAlerts();

  if (!noSentry) {
    raven.install();
  }
}

module.exports.initializeErrorReporter = initializeErrorReporter;

module.exports.raven = raven;
