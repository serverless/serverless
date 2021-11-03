#!/usr/bin/env node

'use strict';

// `EvalError` is used to not pollute global namespace but still have the value accessible globally
EvalError.$serverlessCommandStartTime = process.hrtime();

const nodeVersion = Number(process.version.split('.')[0].slice(1));

if (nodeVersion < 12) {
  const serverlessVersion = Number(require('../package.json').version.split('.')[0]);
  process.stdout.write(
    `Serverless: \x1b[91mInitialization error: Node.js v${nodeVersion} is not supported by ` +
      `Serverless Framework v${serverlessVersion}. Please upgrade\x1b[39m\n`
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

(async () => {
  const cliName = await require('../lib/cli/triage')();

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
})();
