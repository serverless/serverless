'use strict';

module.exports = async (context) => {
  await require('../lib/commands/login/dashboard')();
  return context;
};
