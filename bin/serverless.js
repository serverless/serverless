#!/usr/bin/env node

// WARNING: Do not use syntax not supported by old Node.js versions (v4 lowest)
// It's to ensure that users running those versions, see properly the error message
// (as constructed below) instead of the syntax error

'use strict';

// `EvalError` is used to not pollute global namespace but still have the value accessible globally
// Can already be set, if we're in context of local fallback
const isMainModule = !EvalError.$serverlessCommandStartTime;
if (isMainModule) EvalError.$serverlessCommandStartTime = process.hrtime();

const nodeVersionMajor = Number(process.version.split('.')[0].slice(1));
const nodeVersionMinor = Number(process.version.split('.')[1]);
const minimumSupportedVersionMajor = 14;
const minimumSupportedVersionMinor = 0;

if (
  nodeVersionMajor < minimumSupportedVersionMajor ||
  (nodeVersionMajor === minimumSupportedVersionMajor &&
    nodeVersionMinor < minimumSupportedVersionMinor)
) {
  const serverlessVersion = Number(require('../package.json').version.split('.')[0]);
  process.stderr.write(
    `\x1b[91mError: Serverless Framework v${serverlessVersion} does not support ` +
      `Node.js ${process.version}. Please upgrade Node.js to the latest ` +
      `LTS version (v${minimumSupportedVersionMajor}.${minimumSupportedVersionMinor}.0 is a minimum supported version)\x1b[39m\n`
  );
  process.exit(1);
}

if (isMainModule) {
  if (require('../lib/utils/is-standalone-executable')) {
    require('../lib/utils/standalone-patch');
    if (process.argv[2] === 'binary-postinstall' && process.argv.length === 3) {
      require('../scripts/postinstall');
      return;
    }
  }

  const path = require('path');
  const localInstallationPath = require('../lib/cli/local-serverless-path');
  if (localInstallationPath && localInstallationPath !== path.dirname(__dirname)) {
    // Local fallback
    const localServerlessBinPath = (() => {
      try {
        return require.resolve(path.resolve(localInstallationPath, 'bin/serverless'));
      } catch (ignore) {
        // Unrecognized "serverless" installation, continue with this one
        return null;
      }
    })();

    if (localServerlessBinPath) {
      EvalError.$serverlessInitInstallationVersion = require('../package').version;
      const colorSupportLevel = require('supports-color').stdout.level;
      let message = 'Running "serverless" from node_modules\n';
      if (colorSupportLevel) {
        message =
          colorSupportLevel > 2 ? `\x1b[38;5;145m${message}\x1b[39m` : `\x1b[90m${message}\x1b[39m`;
      }
      process.stderr.write(message);
      require(localServerlessBinPath);
      return;
    }
  }
}

require('../lib/cli/triage')().then((cliName) => {
  switch (cliName) {
    case 'serverless':
      require('../scripts/serverless');
      return;
    case '@serverless/compose':
      require('../lib/cli/run-compose')().catch((error) => {
        // Expose eventual resolution error as regular crash, and not unhandled rejection
        process.nextTick(() => {
          throw error;
        });
      });
      return;
    case 'serverless-tencent':
      {
        const chalk = require('chalk');
        process.stdout.write(
          `${[
            'Serverless Framework CLI no longer supports Serverless Tencent CLI',
            '',
            'To run Serverless Framework without issues in China region, ' +
              `ensure: ${chalk.bold('SLS_GEO_LOCATION=no-cn')} environment variable`,
          ].join('\n')}\n`
        );
      }
      return;
    case '@serverless/components':
      {
        const chalk = require('chalk');
        process.stdout.write(
          `${[
            'Serverless Components CLI is no longer bundled with Serverless Framework CLI',
            '',
            "To run it, ensure it's installed:",
            chalk.bold('npm install -g @serverless/components'),
            '',
            'Then run:',
            chalk.bold('components <command> <options>'),
          ].join('\n')}\n`
        );
      }
      return;
    case '@serverless/cli':
      {
        const chalk = require('chalk');
        process.stdout.write(
          `${[
            'Serverless Components CLI v1 is no longer bundled with Serverless Framework CLI',
            '',
            "To run it, ensure it's installed:",
            chalk.bold('npm install -g @serverless/cli'),
            '',
            'Then run:',
            chalk.bold('components-v1 <command> <options>'),
          ].join('\n')}\n`
        );
      }
      return;
    default:
      throw new Error(`Unrecognized CLI name "${cliName}"`);
  }
});
