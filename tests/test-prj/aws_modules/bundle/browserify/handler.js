'use strict';

//Testing how the top npm modules work with browserify
//https://www.npmjs.com/browse/depended

require('../../jaws-core-js/env/index');

var action = require('./index.js');

module.exports.handler = function(event, context) {
  action.run(event, context, function(error, result) {
    return context.done(error, result);
  });
};
