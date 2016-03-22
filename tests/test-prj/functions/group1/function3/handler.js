'use strict';

// Lambda Handler
module.exports.handler = function(event, context) {
  return context.done(null, { message: '"functionThree" lambda function has run successfully' });
};
