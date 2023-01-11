#!/usr/bin/env node

'use strict';

const path = require('path');
const { version: serverlessVersion } = require('../package.json');
const { stderr, stdout } = process;
const { level: colorSupportLevel } = require('supports-color').stdout;
const chalk = require('chalk');

const { $serverlessCommandStartTime } = EvalError;
const isMainModule = !$serverlessCommandStartTime;
if (isMainModule) EvalError.$serverlessCommandStartTime = process.hrtime();

const [ major, minor ] = process.version.slice(1).split('.').map(Number);
const minimumSupportedMajor = 12;
const minimumSupportedMinor = 13;

if (major < minimumSupportedMajor || (major === minimumSupportedMajor && minor < minimumSupportedMinor)) {
    stderr.write(
        `\x1b[91mError: Serverless Framework v${serverlessVersion} does not support ` +
        `Node.js ${process.version}. Please upgrade Node.js to the latest ` +
        `LTS version (v${minimumSupportedMajor}.${minimumSupportedMinor}.0 is a minimum supported version)\x1b[39m\n`
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

    const localInstallationPath = require('../lib/cli/local-serverless-path');
    if (localInstallationPath && localInstallationPath !== path.dirname(__dirname)) {
        const localServerlessBinPath = (() => {
            try {
                return require.resolve(path.resolve(localInstallationPath, 'bin/serverless'));
            } catch (ignore) {
                return null;
            }
        })();

        if (localServerlessBinPath) {
            EvalError.$serverlessInitInstallationVersion = require('../package').version;
            let message = 'Running "serverless" from node_modules\n';
            if (colorSupportLevel) {
                message = colorSupportLevel > 2 ? `\x1b[38;5;145m${message}\x1b[39m` : `\x1b[90m${message}\x1b[39m`;
            }
            stderr.write(message);
            require(localServerlessBinPath);
            return;
        }
    }
}

require('../lib/cli/triage')().then((cliName) => {
  switch (cliName) {
    case 'serverless':
      require('../scripts/serverless');
      break;
    case '@serverless/compose':
      require('../lib/cli/run-compose')().catch((error) => {
        // Expose eventual resolution error as regular crash, and not unhandled rejection
        process.nextTick(() => {
          throw error;
        });
      });
      break;
    case 'serverless-tencent':
      {
        process.stdout.write(
          `${[
            'Serverless Framework CLI no longer supports Serverless Tencent CLI',
            '',
            'To run Serverless Framework without issues in China region, ' +
              `ensure: ${chalk.bold('SLS_GEO_LOCATION=no-cn')} environment variable`,
          ].join('\n')}\n`
        );
        process.exit(1);
      }
      break;
    default:
      break;
  }
});

 const input = process.argv.slice(2);
  let command = input[0];

  // handle custom commands
  if (command === 'my-custom-command') {
    // do something
    return;
  }

  // handle invalid commands
  if (!['serverless', '@serverless/compose'].includes(command)) {
    stderr.write(`Error: Invalid command "${command}". Please use a valid command.\n`);
    process.exit(1);
  }
  // additional code here
  const input = process.argv.slice(2);
  let command = input[0];
  let options;
  let flags;

  try {
    // use a library to parse input
    const { options: parsedOptions, flags: parsedFlags } = require('minimist')(input);
    options = parsedOptions;
    flags = parsedFlags;
  } catch (err) {
    stderr.write(`Error: Failed to parse input options and flags: ${err.message}\n`);
    process.exit(1);
  }

  // handle custom commands
  if (command === 'my-custom-command') {
    if (flags.debug) {
      // do something with debug flag
    } else {
      // do something without debug flag
    }
    return;
  }

  // handle invalid commands
  if (!['serverless', '@serverless/compose'].includes(command)) {
    stderr.write(`Error: Invalid command "${command}". Please use a valid command.\n`);
    process.exit(1);
  }

  // handle flags and options
  if (command === 'serverless') {
    if (flags.verbose) {
      // enable verbose logging
    }
    // do something with options
  }




