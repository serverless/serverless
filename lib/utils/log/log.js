'use strict';

const _ = require('lodash');
const consoleLog = require('./consoleLog');
const fileLog = require('./fileLog');

const loggers = [
  //consoleLog,
  fileLog
];

const log = function() {
  _.each(loggers, (logger) => logger.apply(null, arguments));
};

module.exports = log;
