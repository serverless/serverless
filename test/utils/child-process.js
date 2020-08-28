'use strict';

const { execSync: originalExecSync } = require('child_process');

function execSync(command, options = null) {
  // Same as native but outputs std in case of error
  try {
    return originalExecSync(command, options);
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

module.exports = { execSync };
