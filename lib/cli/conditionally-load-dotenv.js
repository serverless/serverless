'use strict';

const _ = require('lodash');

module.exports = async (options, configuration) => {
  const stage = options.stage || _.get(configuration, 'provider.stage', 'dev');
  if (configuration.useDotenv) {
    require('./load-dotenv')(stage);
    return;
  }
};
