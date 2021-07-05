'use strict';

const path = require('path');
const memoizee = require('memoizee');
const resolveSync = require('ncjsm/resolve/sync');

// This method should be kept as sync. The reason for it is the fact that
// telemetry generation and persistence needs to be run in sync manner
// and it depends on this function, either directly or indirectly.
module.exports = memoizee(() => {
  try {
    return path.resolve(path.dirname(resolveSync(process.cwd(), 'serverless').realPath), '..');
  } catch {
    return null;
  }
});
