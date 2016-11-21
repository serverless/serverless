'use strict';

module.exports.hello = (event, context, callback) => {
  callback(null, {
    provider_level_variable: process.env.provider_level_variable,
    function_level_variable: process.env.function_level_variable,
  });
};
