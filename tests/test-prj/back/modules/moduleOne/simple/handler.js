'use strict';

require('dotenv');

// Lambda Handler
module.exports.handler = function(event, context) {
  return context.done(null, { message: 'simple lambda function has run successfully' });
};
