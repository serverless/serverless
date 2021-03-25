'use strict';

const chalk = require('chalk');

module.exports = (commandName, commandSchema) => {
  const dotsLength = 30;

  const usage = commandSchema.usage;
  const dots = '.'.repeat(Math.max(dotsLength - commandName.length, 0));
  return `${chalk.yellow(commandName)} ${chalk.dim(dots)} ${usage}`;
};
