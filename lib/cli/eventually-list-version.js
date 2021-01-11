'use strict';

const path = require('path');
const { version } = require('../../package');
const { version: dashboardPluginVersion } = require('@serverless/enterprise-plugin/package');
const { version: componentsVersion } = require('@serverless/components/package');
const { sdkVersion } = require('@serverless/enterprise-plugin');
const isStandaloneExecutable = require('../utils/isStandaloneExecutable');
const resolveLocalServerlessPath = require('./resolve-local-serverless-path');

const serverlessPath = path.resolve(__dirname, '../Serverless.js');

module.exports = async () => {
  const cliParams = new Set(process.argv.slice(2));
  if (!cliParams.has('--version')) {
    // Ideally we should output version info in whatever context "--version" or "-v" params
    // are used. Still "-v" is defined also as a "--verbose" alias in some commands.
    // Support for "--verbose" is expected to go away with
    // https://github.com/serverless/serverless/issues/1720
    // Until that's addressed we can recognize "-v" only as top-level param
    if (cliParams.size !== 1) return false;
    if (!cliParams.has('-v')) return false;
  }

  const installationModePostfix = await (async () => {
    if (isStandaloneExecutable) return ' (standalone)';
    if (serverlessPath === (await resolveLocalServerlessPath())) return ' (local)';
    return '';
  })();

  process.stdout.write(
    `Framework Core: ${version}${installationModePostfix}\n` +
      `Plugin: ${dashboardPluginVersion}\n` +
      `SDK: ${sdkVersion}\n` +
      `Components: ${componentsVersion}\n`
  );

  return true;
};
