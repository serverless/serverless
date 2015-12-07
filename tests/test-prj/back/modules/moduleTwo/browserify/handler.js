'use strict';

require('dotenv');

// Modularized Code
var moduleOne = require('../../moduleone/lib');

// Lambda Handler
module.exports.handler = function(event, context) {
  moduleOne.complex(event, context, function(error, result) {
    return context.done(error, result);
  });
};
