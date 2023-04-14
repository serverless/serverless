'use strict';
const _get = require('../utils/purekit/get');

const resolveStage = ({ configuration, options }) => {
  return options.stage || _get(configuration, 'provider.stage') || 'dev';
};

module.exports = resolveStage;
