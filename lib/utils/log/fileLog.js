'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');

const fileLog = function () {
  // TODO BRN: This does not guarentee order, is not multi process safe,
  // TODO BRN: and is not guarenteed to complete before exit.
  fs.appendFileSync(path.join(process.cwd(), 'sls.log'),
    _.join(Array.prototype.slice.call(arguments)) + '\n'); // eslint-disable-line prefer-template
};

module.exports = fileLog;
