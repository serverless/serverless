'use strict';

module.exports.hello = (event, context, callback) => {
  callback(null, {
    environment_variables: process.env,
  });
};
