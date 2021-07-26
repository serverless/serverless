'use strict';

const path = require('path');
const { version } = require('../../package');
const { version: dashboardPluginVersion } = require('@serverless/dashboard-plugin/package');
const { version: componentsVersion } = require('@serverless/components/package');
const { platformClientVersion } = require('@serverless/dashboard-plugin');
const isStandaloneExecutable = require('../utils/isStandaloneExecutable');
const resolveLocalServerlessPath = require('./resolve-local-serverless-path');
const chalk = require('chalk');
const ServerlessError = require('../serverless-error');

const serverlessPath = path.resolve(__dirname, '../..');

module.exports = async () => {
  const localServerlessPath = resolveLocalServerlessPath();

  if (localServerlessPath) {
    // If the version is already local, do not try to fallback for version resolution to avoid falling into the loop
    // TODO: Remove local version fallback with next major (when its moved to the top of the process)
    const isLocal = serverlessPath === localServerlessPath;
    if (!isLocal) {
      // Attempt to resolve version with local Serverless instance
      process.stdout.write(
        `Serverless: ${chalk.yellow(
          'Running "serverless" installed locally (in service node_modules)'
        )}\n`
      );

      try {
        try {
          require(path.resolve(localServerlessPath, 'bin/serverless.js'));
        } catch {
          // Pass and attempt to use `bin/serverless` that was used by older version of the Framework
          require(path.resolve(localServerlessPath, 'bin/serverless'));
        }
      } catch {
        // This is just a fallback as for most (all?) versions it shouldn't happen
        throw new ServerlessError(
          'Could not resolve path to locally installed serverless.',
          'INVALID_LOCAL_SERVERLESS_PATH'
        );
      }
      return;
    }
  }

  const installationModePostfix = await (async () => {
    if (isStandaloneExecutable) return ' (standalone)';
    if (serverlessPath === localServerlessPath) return ' (local)';
    return '';
  })();

  process.stdout.write(
    `Framework Core: ${version}${installationModePostfix}\n` +
      `Plugin: ${dashboardPluginVersion}\n` +
      `SDK: ${platformClientVersion}\n` +
      `Components: ${componentsVersion}\n`
  );
};
