'use strict';

const _get = require('../utils/purekit/get');

module.exports = ({ configuration, options }) =>
  Boolean(_get(configuration, 'org') || options.org) &&
  Boolean(_get(configuration, 'app') || options.app) &&
  !_get(configuration, 'dashboard.disableMonitoring');
