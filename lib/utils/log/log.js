'use strict';

const fileLog = require('./fileLog');

const loggers = [
  // consoleLog,
  fileLog,
];

const log = function (...args) {
  loggers.forEach((logger) => logger(...args));
};

module.exports = log;
