'use strict';

const { writeText, style } = require('@serverless/utils/log');
const commandSchema = require('../commands-schema').get('');
const renderOptions = require('./options');

module.exports = () => {
  writeText(
    style.aside('Interactive CLI'),
    `Run ${style.strong('serverless')} to interactively setup a project.`,
    null,
    style.aside('Options')
  );

  renderOptions(commandSchema.options);
};
