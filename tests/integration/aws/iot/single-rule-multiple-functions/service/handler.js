'use strict';

module.exports.iot1 = (event, context, callback) => {
  process.stdout.write(JSON.stringify(event));
  callback(null, {});
};

module.exports.iot2 = (event, context, callback) => {
  process.stdout.write(JSON.stringify(event));
  callback(null, {});
};
