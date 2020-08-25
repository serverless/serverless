#!/usr/bin/env node

'use strict';

if (require('../lib/utils/isStandaloneExecutable')) {
  require('../lib/utils/standalone-patch');
  if (process.argv[2] === 'binary-postinstall' && process.argv.length === 3) {
    require('../scripts/postinstall');
    return;
  }
}

// CLI Triage
try {
  const componentsV1 = require('@serverless/cli');
  const componentsV2 = require('@serverless/components');

  if (componentsV1.runningComponents()) {
    // Serverless Components v1 CLI (deprecated)
    componentsV1.runComponents();
    return;
  }

  if (componentsV2.runningComponents()) {
    // Serverless Components CLI
    componentsV2.runComponents();
    return;
  }
} catch (error) {
  if (process.env.SLS_DEBUG) {
    require('../lib/classes/Error').logWarning(`CLI triage crashed with: ${error.stack}`);
  }
}

// Serverless Framework CLI
require('../scripts/serverless');
