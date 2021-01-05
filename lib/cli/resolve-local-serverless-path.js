'use strict';

const memoizee = require('memoizee');
const resolve = require('ncjsm/resolve');

module.exports = memoizee(
  async () => {
    try {
      return (await resolve(process.cwd(), 'serverless')).realPath;
    } catch {
      return null;
    }
  },
  { promise: true }
);
