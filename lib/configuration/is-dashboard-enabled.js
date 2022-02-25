'use strict';

module.exports = ({ configuration, options }) => {
  if (configuration) {
    if (configuration.console && !configuration.dashboard) return false;
    if (configuration.org) return true;
  }
  return Boolean(options.org);
};
