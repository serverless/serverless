'use strict';

const path = require('path');
const { createRequire } = require('module');
const memoize = require('memoizee');

module.exports = memoize((dirname) => createRequire(path.resolve(dirname, 'require-resolver')), {
  primitive: true,
});
