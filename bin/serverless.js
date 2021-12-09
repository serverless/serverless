#!/usr/bin/env node

// WARNING: Do not use syntax not supported by old Node.js versions (v4 lowest)
// It's to ensure that users running those versions, see properly the error message
// (as constructed below) instead of the syntax error

'use strict';

// `EvalError` is used to not pollute global namespace but still have the value accessible globally
EvalError.$serverlessCommandStartTime = process.hrtime();

const nodeVersion = Number(process.version.split('.')[0].slice(1));
const minimumSupportedVersion = 12;

if (nodeVersion < minimumSupportedVersion) {
  const serverlessVersion = Number(require('../package.json').version.split('.')[0]);
  process.stderr.write(
    `\x1b[91mError: Serverless Framework v${serverlessVersion} does not support ` +
      `Node.js v${nodeVersion}. Please upgrade Node.js to the latest ` +
      `LTS version (v${minimumSupportedVersion} is a minimum supported version)\x1b[39m\n`
  );
  process.exit(1);
}

if (require('../lib/utils/isStandaloneExecutable')) {
  require('../lib/utils/standalone-patch');
  if (process.argv[2] === 'binary-postinstall' && process.argv.length === 3) {
    require('../scripts/postinstall');
    return;
  }
}

require('../lib/cli/triage')().then((cliName) => {
  switch (cliName) {
    case 'serverless':
      require('../scripts/serverless');
      return;
    case 'serverless-tencent':
      require('../lib/cli/run-serverless-tencent')().catch((error) => {
        // Expose eventual resolution error as regular crash, and not unhandled rejection
        process.nextTick(() => {
          throw error;
        });
      });
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
      require('@serverless/cli').runComponents();
      return;
    default:
      throw new Error(`Unrecognized CLI name "${cliName}"`);
  }
});
