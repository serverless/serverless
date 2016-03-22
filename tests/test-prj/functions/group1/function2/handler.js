'use strict';

// Lambda Handler
module.exports.handler = function(event, context) {
  return context.done(null, { message: '"functionTwo" lambda function has run successfully' });
};
