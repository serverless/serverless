'use strict';

const chalk = require('chalk');
const commmandSchema = require('../commands-schema/no-service').get('');
const renderOptions = require('./options');

module.exports = () => {
  process.stdout.write(`${chalk.yellow.underline('Interactive CLI')}\n`);
  process.stdout.write(
    `${chalk.yellow(
      `Run serverless (or shortcut sls) a subcommand to initialize an interactive setup of
functionalities related to given service or current environment`
    )}\n`
  );

  renderOptions(commmandSchema.options);
};
