'use strict';

module.exports = (frequency = null) => {
  return frequency || process.env.SLS_AWS_MONITORING_FREQUENCY || 5000;
};
