'use strict';

const configUtils = require('./config');

module.exports = function isTrackingDisabled() {
  return configUtils.get('trackingDisabled');
};
