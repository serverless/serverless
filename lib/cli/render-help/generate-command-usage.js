'use strict';

const chalk = require('chalk');
const { style } = require('@serverless/utils/log');

module.exports = (commandName, commandSchema, options = {}) => {
  const indentFillLength = 30;

  const usage = commandSchema.usage;
  if (options.isModern) {
    return `${commandName} ${' '.repeat(
      Math.max(indentFillLength - commandName.length, 0)
    )} ${style.aside(usage)}`;
  }
  const dots = '.'.repeat(Math.max(indentFillLength - commandName.length, 0));
  return `${chalk.yellow(commandName)} ${chalk.dim(dots)} ${usage}`;
};
