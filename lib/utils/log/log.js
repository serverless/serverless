'use strict';

const _ = require('lodash');
const consoleLog = require('./consoleLog'); // eslint-disable-line no-unused-vars
const fileLog = require('./fileLog');

const loggers = [
  // consoleLog,
  fileLog,
];

const log = function(...args) {
  _.each(loggers, logger => logger(...args));
};

module.exports = log;
