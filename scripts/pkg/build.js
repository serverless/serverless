#!/usr/bin/env node

// Node.js v8+ only

'use strict';

require('essentials');

const path = require('path');
const spawn = require('child-process-ext/spawn');
const fse = require('fs-extra');

const serverlessPath = path.join(__dirname, '../..');
const spawnOptions = { cwd: serverlessPath, stdio: 'inherit' };

(async () => {
  // To bundle npm with a binary we need to install it
  process.stdout.write('Install npm\n');
  // Hard code npm version to one that comes with lastest Node.js
  // It's due to fact that npm tends to issue buggy releases
  // Node.js confirms on given version before including it within its bundle
  // Version mappings reference: https://nodejs.org/en/download/releases/
  await spawn('npm', ['install', '--no-save', 'npm@8.1.2'], spawnOptions);

  try {
    process.stdout.write('Build binaries\n');
    await spawn(
      'node',
      [
        './node_modules/.bin/pkg',
        '-c',
        'scripts/pkg/config.js',
        '--targets',
        'node16-linux-x64,node16-mac-x64,node16-win-x64',
        '--out-path',
        'dist',
        'bin/serverless.js',
      ],
      spawnOptions
    );
  } finally {
    await fse.remove(path.join(serverlessPath, 'node_modules/npm'));
  }
})();
