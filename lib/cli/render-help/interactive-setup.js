'use strict';

const chalk = require('chalk');
const { legacy, writeText, style } = require('@serverless/utils/log');
const commmandSchema = require('../commands-schema/no-service').get('');
const renderOptions = require('./options');

module.exports = () => {
  writeText(
    style.aside('Interactive CLI'),
    `Run ${style.strong('serverless')} to interactively setup a project.`,
    null,
    style.aside('Options')
  );

  legacy.write(`${chalk.yellow.underline('Interactive CLI')}\n`);
  legacy.write(
    `${chalk.yellow(
      `Run serverless (or shortcut sls) a subcommand to initialize an interactive setup of
functionalities related to given service or current environment`
    )}\n`
  );

  renderOptions(commmandSchema.options);
};
