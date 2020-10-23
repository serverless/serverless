'use strict';

const memoizee = require('memoizee');
const path = require('path');
const spawn = require('child-process-ext/spawn');

const serverlessPackageRoot = path.resolve(__dirname, '../../../');

module.exports = memoizee(
  async () => {
    const npmPackagesRoot = await (async () => {
      try {
        return String((await spawn('npm', ['root', '-g'])).stdoutBuffer).trim();
      } catch {
        return null;
      }
    })();
    if (!npmPackagesRoot) return false;
    return path.resolve(npmPackagesRoot, 'serverless') === serverlessPackageRoot;
  },
  { type: 'promise' }
);
