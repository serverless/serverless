'use strict';

module.exports.hello = function (context, req) {
  // Add any neccessary telemetry to support diagnosing your function
  context.log('HTTP trigger occured!');

  // Read properties from the incoming request, and respond as appropriate.
  const name = req.query.name || (req.body && req.body.name) || 'World';
  context.done(null, { body: `Hello ${name}` });
};
