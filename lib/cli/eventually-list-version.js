'use strict';

const path = require('path');
const { version } = require('../../package');
const { version: dashboardPluginVersion } = require('@serverless/enterprise-plugin/package');
const { version: componentsVersion } = require('@serverless/components/package');
const { sdkVersion } = require('@serverless/enterprise-plugin');
const isStandaloneExecutable = require('../utils/isStandaloneExecutable');
const resolveLocalServerlessPath = require('./resolve-local-serverless-path');
const chalk = require('chalk');
const ServerlessError = require('../serverless-error');

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

  const localServerlessPath = await resolveLocalServerlessPath();

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
      const localServerlessDir = path.resolve(path.dirname(localServerlessPath), '..');

      try {
        try {
          require(path.resolve(localServerlessDir, 'bin/serverless.js'));
          return true;
        } catch {
          // Pass and attempt to use `bin/serverless` that was used by older version of the Framework
          require(path.resolve(localServerlessDir, 'bin/serverless'));
          return true;
        }
      } catch {
        // This is just a fallback as for most (all?) versions it shouldn't happen
        throw new ServerlessError(
          'Could not resolve path to locally installed serverless.',
          'INVALID_LOCAL_SERVERLESS_PATH'
        );
      }
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
      `SDK: ${sdkVersion}\n` +
      `Components: ${componentsVersion}\n`
  );

  return true;
};
