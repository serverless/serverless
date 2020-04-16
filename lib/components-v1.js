// TODO: Remove once Components is stable

'use strict';

try {
  module.exports = require('@serverless/cli');
} catch (error) {
  module.exports = null;
  if (process.env.SLS_DEBUG) {
    require('./classes/Error').logWarning(
      `Components v1 engine initialization crashed with: ${error.stack}`
    );
  }
}
