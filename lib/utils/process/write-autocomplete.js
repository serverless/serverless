'use strict';

/* Note: This file runs as a detached sub process */

const writeFileSync = require('../fs/writeFileSync');

const options = JSON.parse(process.argv[2]);
try {
  writeFileSync(options.cacheFilePath, options.cacheFile);
  process.exit();
} catch (e) {
  process.exit(1);
}
