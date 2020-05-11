'use strict';

const consoleLog = require('./consoleLog'); // eslint-disable-line no-unused-vars
const fileLog = require('./fileLog');

const loggers = [
  // consoleLog,
  fileLog,
];

const log = function(...args) {
  loggers.forEach(logger => logger(...args));
};

module.exports = log;
