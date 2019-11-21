'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');

const fileLog = function(...args) {
  // TODO BRN: This does not guarantee order, is not multi process safe,
  // TODO BRN: and is not guaranteed to complete before exit.
  fs.appendFileSync(path.join(process.cwd(), 'sls.log'), `${_.join(args)}\n`);
};

module.exports = fileLog;
