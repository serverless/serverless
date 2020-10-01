'use strict';

function handler(event, context, callback) {
  const functionName = 'provisionedFunc';
  // eslint-disable-next-line no-console
  console.log(functionName, JSON.stringify(event));
  return callback(null, event);
}

module.exports = { handler };
