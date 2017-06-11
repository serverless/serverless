'use strict';

/* eslint-disable no-param-reassign */

module.exports.hello = function (context, req) {
  context.log('JavaScript HTTP trigger function processed a request.');
  
  context.res = {
    // status: 200, /* Defaults to 200 */
    body: 'Go Serverless v1.0! Your function executed successfully!',
  };

  context.done();
};
