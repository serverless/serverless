'use strict';
const _ = require('lodash');

const resolveRegion = ({ configuration, options }) => {
  return options.region || _.get(configuration, 'provider.region') || 'us-east-1';
};

module.exports = resolveRegion;
