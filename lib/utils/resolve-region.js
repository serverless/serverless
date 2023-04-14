'use strict';
const _get = require('../utils/purekit/get');

const resolveRegion = ({ configuration, options }) => {
  return options.region || _get(configuration, 'provider.region') || 'us-east-1';
};

module.exports = resolveRegion;
