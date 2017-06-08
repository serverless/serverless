'use strict';

const _ = require('lodash');
const consoleLog = require('./consoleLog'); // eslint-disable-line no-unused-vars
const fileLog = require('./fileLog');

const loggers = [
  // consoleLog,
  fileLog,
];

const log = function () {
  _.each(loggers, (logger) => logger.apply(null, arguments)); // eslint-disable-line prefer-spread
};

module.exports = log;
