'use strict';
const _ = require('lodash');

const resolveStage = ({ configuration, options }) => {
  return options.stage || _.get(configuration, 'provider.stage') || 'dev';
};

module.exports = resolveStage;
