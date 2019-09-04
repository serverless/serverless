'use strict';

module.exports.printMessage = async function(context, message) {
  context.log('================= MESSAGE START =================');

  context.log('Node.js ServiceBus queue trigger function processed message');

  context.log('Message ID: ', context.bindingData.messageId);
  context.log('Delivery Count: ', context.bindingData.deliveryCount);
  context.log('Message insertion time (Utc): ', context.bindingData.enqueuedTimeUtc);
  context.log('Message length: ', message.length, ' bytes');

  context.log('Message content: ', message);

  context.log('================= MESSAGE END =================');

  context.done();
};
