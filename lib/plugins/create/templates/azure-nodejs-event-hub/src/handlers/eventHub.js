'use strict';

module.exports.printMessage = async function(context, eventHubMessages) {
  context.log('================= MESSAGE START =================');

  context.log('Node.js EventHub trigger function processed message');

  context.log('Message ID: ', context.bindingData.sequenceNumber);
  context.log('Message insertion time (Utc): ', context.bindingData.enqueuedTimeUtc);
  context.log('Message length: ', eventHubMessages.length, ' bytes');
  context.log(`Received message from offset ${context.bindingData.offset}`);

  context.log('Message content: ', eventHubMessages);
  context.log('================= MESSAGE END =================');
};
