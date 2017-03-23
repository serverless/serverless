'use strict';

module.exports.cwe1 = (event, context, callback) => {
  process.stdout.write(JSON.stringify(event));
  callback(null, {});
};

module.exports.cwe2 = (event, context, callback) => {
  process.stdout.write(JSON.stringify(event));
  callback(null, {});
};
