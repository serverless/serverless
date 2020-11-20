#!/usr/bin/env node

'use strict';

const nodeVersion = Number(process.version.split('.')[0].slice(1));

if (nodeVersion < 10) {
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

// CLI Triage
(() => {
  try {
    const componentsV1 = require('@serverless/cli');
    const componentsV2 = require('@serverless/components');

    // Serverless Components v1 CLI (deprecated)
    if (componentsV1.runningComponents()) return () => componentsV1.runComponents();

    // Serverless Components CLI
    if (componentsV2.runningComponents()) return () => componentsV2.runComponents();
  } catch (error) {
    if (process.env.SLS_DEBUG) {
      require('../lib/classes/Error').logWarning(`CLI triage crashed with: ${error.stack}`);
    }
  }

  // Serverless Framework CLI
  return () => require('../scripts/serverless');
})()();
