'use strict';

const fs = require('fs');

const filename = process.env.FILENAME;

function writer(event, context, callback) {
  fs.writeFileSync(filename, 'fromlambda', 'utf8');
  return callback(null, event);
}

function reader(event, context, callback) {
  const result = fs.readFileSync(filename, 'utf8');
  return callback(null, { result });
}

module.exports = { writer, reader };
