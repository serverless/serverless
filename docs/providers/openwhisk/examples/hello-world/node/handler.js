'use strict';

// Your function handler
module.exports.helloWorldHandler = function (params) {
  const name = params.name || 'World';
  return { payload: `Hello, ${name}!` };
};
