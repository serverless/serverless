'use strict';

require('dotenv').config({path: path.join('REPLACE_REL_PATH', '.env'), silent: true});

module.exports.handler = function(event, context) {
  console.log('about to run..');

  context.done(null, {message: 'You\'ve made a successful request to your JAWS Lambda!'});
};
