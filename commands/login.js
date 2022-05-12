'use strict';

module.exports = async ({ options }) => {
  if (options.console) require('../lib/commands/login/console')();
  else require('../lib/commands/login/dashboard')();
};
