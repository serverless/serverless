'use strict';

module.exports.printMessage = async function (context, message) {
  'use strict';

  module.exports.handler = async function (context, message) {
    context.log("================= MESSAGE START =================")

    context.log("Message ID: ", context.bindingData.messageId);
    context.log("Message insertion time: ", context.bindingData.enqueuedTimeUtc);
    context.log('Message length: ', message.length, ' bytes');
    // message can either be json or plain text
    context.log('Message:', JSON.stringify(message, null, 2));

    context.log("================= MESSAGE END =================")

    context.done();
  };
