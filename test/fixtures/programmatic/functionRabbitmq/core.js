'use strict';

// NOTE: `amqplib` is bundled into the deployment package
// eslint-disable-next-line import/no-unresolved
const amqp = require('amqplib');

function consumer(event, context, callback) {
  const functionName = 'consumer';
  const messages = [];

  Object.keys(event.rmqMessagesByQueue).forEach((queueKey) => {
    const queue = event.rmqMessagesByQueue[queueKey];
    queue.forEach((message) => {
      messages.push(Buffer.from(message.data, 'base64').toString());
    });
  });
  // eslint-disable-next-line no-console
  console.log(functionName, JSON.stringify(messages));

  return callback(null, event);
}

async function producer() {
  await new Promise((resolve) => {
    const connectOptions = {
      protocol: 'amqps',
      hostname: process.env.RABBITMQ_HOST,
      port: 5671,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD,
    };

    amqp
      .connect(connectOptions)
      .then((connection) => {
        return connection.createChannel();
      })
      .then((channel) => {
        const queueName = process.env.QUEUE_NAME;
        return channel.assertQueue(queueName).then(() => {
          channel.sendToQueue(queueName, Buffer.from('Hello from RabbitMQ Integration test!'));
          resolve();
        });
      })
      .catch((err) => {
        console.error(err);
        resolve();
      });
  });

  return {
    statusCode: 200,
  };
}

module.exports = { producer, consumer };
