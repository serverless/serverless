'use strict';

const path = require('path');

module.exports = (() => {
  if (process.env.SERVERLESS_BINARY_PATH) return path.resolve(process.env.SERVERLESS_BINARY_PATH);
  return path.join(__dirname, '../bin/serverless.js');
})();
