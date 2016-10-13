/* eslint no-console: off */
'use strict';

const chalk = require('chalk');

module.exports = {
  error(msg) {
    console.error(chalk.red(msg));
  },

  info(msg) {
    console.log(msg);
  },
};
