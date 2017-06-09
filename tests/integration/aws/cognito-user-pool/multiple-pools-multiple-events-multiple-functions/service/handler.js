'use strict';

const preSignUp = (event, context, callback) => {
  const nextEvent = Object.assign({}, event);
  nextEvent.response.autoConfirmUser = true;

  process.stdout.write(JSON.stringify(nextEvent));
  callback(null, nextEvent);
};

const customMessage = (event, context, callback) => {
  const nextEvent = Object.assign({}, event);
  if (event.triggerSource === 'CustomMessage_SignUp') {
    nextEvent.response.smsMessage = `Welcome to the service. Your confirmation code is ${
      event.request.codeParameter}`;
    nextEvent.response.emailSubject = 'Welcome to the service';
    nextEvent.response.emailMessage = `Thank you for signing up. ${
      event.request.codeParameter} is your verification code`;
  }
  process.stdout.write(JSON.stringify(nextEvent));
  callback(null, nextEvent);
};

module.exports.preSignUp1 = preSignUp;
module.exports.preSignUp2 = preSignUp;
module.exports.customMessage1 = customMessage;
module.exports.customMessage2 = customMessage;
