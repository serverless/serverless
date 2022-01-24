'use strict';

// NOTE: `stompit` is bundled into the deployment package
// eslint-disable-next-line import/no-unresolved
const stompit = require('stompit');

function consumer(event, context, callback) {
  const functionName = 'consumer';
  const messages = event.messages.map((message) => Buffer.from(message.data, 'base64').toString());
  // eslint-disable-next-line no-console
  console.log(functionName, JSON.stringify(messages));
  return callback(null, event);
}

async function producer() {
  const connectOptions = {
    host: process.env.MQ_HOST,
    port: 61614,
    ssl: true,
    connectHeaders: {
      login: process.env.MQ_USERNAME,
      passcode: process.env.MQ_PASSWORD,
    },
  };
  const queueName = process.env.QUEUE_NAME;

  const sendPromise = new Promise((resolve, reject) => {
    stompit.connect(connectOptions, (error, client) => {
      if (error) {
        console.log(`connect error ${error.message}`);
        reject(error);
      }

      const frame = client.send({
        'destination': queueName,
        'content-type': 'text/plain',
      });
      frame.write('Hello from Apache MQ Integration test!');
      frame.end();

      client.disconnect();
      resolve();
    });
  });

  await sendPromise;

  return {
    statusCode: 200,
  };
}

module.exports = { producer, consumer };
