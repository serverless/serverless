'use strict';

// NOTE: the `utils.js` file is bundled into the deployment package
// eslint-disable-next-line
const { log } = require('./utils');
const fs = require('fs');

const filename = '/mnt/testing/file.txt';

function writer(event, context, callback) {
  const functionName = 'writer';
  log(functionName, JSON.stringify(event));
  fs.writeFileSync(filename, 'fromlambda', 'utf8');
  return callback(null, event);
}

function reader(event, context, callback) {
  const functionName = 'reader';
  log(functionName, JSON.stringify(event));
  const result = fs.readFileSync(filename, 'utf8');
  return callback(null, { result });
}

module.exports = { writer, reader };
