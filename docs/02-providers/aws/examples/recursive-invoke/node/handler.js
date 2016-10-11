'use strict';
var aws = require('aws-sdk');

module.exports.recursiveLambda = function (event, context, callback) {
  var lambda = new aws.Lambda();
  console.log('received', event);
  if (event.calls > 0) {
    console.log('recursive call');
    event.calls = event.calls - 1;
    var params = {
      FunctionName: context.functionName,
      InvocationType: 'Event',
      Payload: JSON.stringify(event),
      Qualifier: context.functionVersion
    };
    lambda.invoke(params, context.done);
  } else {
    console.log('recursive call finished')
    context.succeed('finished');
  }
};
