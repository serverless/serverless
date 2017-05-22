'use strict';

module.exports.preSignUp = (event, context, callback) => {
  const nextEvent = Object.assign({}, event);
  nextEvent.response.autoConfirmUser = true;

  process.stdout.write(JSON.stringify(nextEvent));
  callback(null, nextEvent);
};
