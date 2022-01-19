'use strict';

const { writeText, style } = require('@serverless/utils/log');
const commmandSchema = require('../commands-schema/no-service').get('');
const renderOptions = require('./options');

module.exports = () => {
  writeText(
    style.aside('Interactive CLI'),
    `Run ${style.strong('serverless')} to interactively setup a project.`,
    null,
    style.aside('Options')
  );

  renderOptions(commmandSchema.options);
};
