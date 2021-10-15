// TODO: Remove with next major release

'use strict';

const _ = require('lodash');
const memoizee = require('memoizee');

module.exports = memoizee(
  async (options, configuration) => {
    const stage = options.stage || _.get(configuration, 'provider.stage', 'dev');
    if (configuration.useDotenv) {
      require('./load-dotenv')(stage);
      return;
    }
  },
  {
    length: 0 /* Intentionally no "promise: true" as rejection means critical non-retryable error */,
  }
);
