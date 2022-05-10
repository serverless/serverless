'use strict';

const _ = require('lodash');

module.exports = ({ configuration, options }) =>
  Boolean(_.get(configuration, 'org') || options.org) &&
  Boolean(_.get(configuration, 'app') || options.app) &&
  !_.get(configuration, 'dashboard.disableMonitoring');
