#!/usr/bin/env node

// WARNING: Do not use syntax not supported by old Node.js versions (v4 lowest)
// It's to ensure that users running those versions, see properly the error message
// (as constructed below) instead of the syntax error

'use strict';

// `EvalError` is used to not pollute global namespace but still have the value accessible globally
EvalError.$serverlessCommandStartTime = process.hrtime();

const nodeVersion = Number(process.version.split('.')[0].slice(1));

if (nodeVersion < 12) {
  if (nodeVersion >= 10) {
    require('../lib/utils/logDeprecation')(
      'OUTDATED_NODEJS',
      'Support for Node.js versions below v12 will be dropped with next major release. Please upgrade at https://nodejs.org/en/'
    );
  } else {
    const serverlessVersion = Number(require('../package.json').version.split('.')[0]);
    process.stdout.write(
      `Serverless: \x1b[91mInitialization error: Node.js v${nodeVersion} is not supported by ` +
        `Serverless Framework v${serverlessVersion}. Please upgrade\x1b[39m\n`
    );
    process.exit(1);
  }
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
    case '@serverless/components':
      require('@serverless/components').runComponents();
      return;
    case '@serverless/cli':
      require('@serverless/cli').runComponents();
      return;
    default:
      throw new Error(`Unrecognized CLI name "${cliName}"`);
  }
});
