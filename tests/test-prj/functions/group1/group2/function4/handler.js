'use strict';

// Lambda Handler
module.exports.handler = function(event, context) {
  return context.done(null, { message: '"functionFour" lambda function has run successfully' });
};
