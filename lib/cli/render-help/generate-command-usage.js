'use strict';

const { style } = require('@serverlessinc/core-utils');

module.exports = (commandName, commandSchema) => {
  const indentFillLength = 30;

  const usage = commandSchema.usage;
  return `${commandName} ${' '.repeat(
    Math.max(indentFillLength - commandName.length, 0)
  )} ${style.aside(usage)}`;
};
