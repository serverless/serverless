'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');

const fileLog = function() {
  //TODO BRN: This does not guarentee order, is not multi process safe, and is not guarenteed to complete before exit.
  fs.appendFileSync(path.join(process.cwd(), 'sls.log'), _.join(Array.prototype.slice.call(arguments)) + '\n');
};

module.exports = fileLog;
