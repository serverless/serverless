'use strict';

const path = require('path');
const memoizee = require('memoizee');
const resolve = require('ncjsm/resolve');

module.exports = memoizee(
  async () => {
    try {
      return path.resolve(
        path.dirname((await resolve(process.cwd(), 'serverless')).realPath),
        '..'
      );
    } catch {
      return null;
    }
  },
  { promise: true }
);
