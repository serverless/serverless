'use strict';

const _get = require('../utils/purekit/get');

module.exports = async (options, configuration) => {
  const stage = options.stage || _get(configuration, 'provider.stage', 'dev');
  if (!configuration.useDotenv) return false;
  require('./load-dotenv')(stage);
  return true;
};
