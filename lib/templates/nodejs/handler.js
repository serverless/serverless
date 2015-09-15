'use strict';

var path = require('path');

require('dotenv').config({path: path.join(eval('__dirname'), '..', '..', '..', '.env'), silent: true});

module.exports.handler = function(event, context) {
  console.log('about to run..');
  console.log('Environment: ' + process.env.JAWS_STAGE);

  context.done(null, {message: 'You\'ve made a successful request to your JAWS Lambda!'});
};
