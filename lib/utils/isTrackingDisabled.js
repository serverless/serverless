'use strict';

const configUtils = require('./config');

module.exports = process.env.SLS_TRACKING_DISABLED || configUtils.get('trackingDisabled');
