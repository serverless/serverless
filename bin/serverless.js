#!/usr/bin/env node

'use strict';

if (require('../lib/utils/isStandaloneExecutable')) {
  require('../lib/utils/standalone-patch');
  if (process.argv[2] === 'binary-postinstall' && process.argv.length === 3) {
    require('../scripts/postinstall');
    return;
  }
}

const nodeVersion = Number(process.version.split('.')[0].slice(1));

// only check for components if user is running Node 8
if (nodeVersion >= 8) {
  const componentsV1 = require('../lib/components-v1');
  const componentsV2 = require('../lib/components-v2');

  if (componentsV1 && componentsV1.runningComponents()) {
    componentsV1.runComponents();
    return;
  }

  if (componentsV2 && componentsV2.runningComponents()) {
    componentsV2.runComponents();
    return;
  }
}

require('../scripts/serverless');
