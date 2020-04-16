// TODO: Remove once Components is stable

'use strict';

try {
  module.exports = require('@serverless/components');
} catch (error) {
  module.exports = null;
  if (process.env.SLS_DEBUG) {
    require('./classes/Error').logWarning(
      `Components v2 engine initialization crashed with: ${error.stack}`
    );
  }
}
