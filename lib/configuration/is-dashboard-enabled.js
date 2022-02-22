'use strict';

module.exports = ({ configuration, options }) =>
  Boolean((configuration && configuration.org) || options.org);
