'use strict';

// NOTE: `kafkajs` is bundled into the deployment package
// eslint-disable-next-line import/no-unresolved
const { Kafka } = require('kafkajs');

function consumer(event, context, callback) {
  const functionName = 'consumer';
  const { records } = event;
  const messages = Object.values(records)[0].map(record =>
    Buffer.from(record.value, 'base64').toString()
  );
  // eslint-disable-next-line no-console
  console.log(functionName, JSON.stringify(messages));
  return callback(null, event);
}

async function producer() {
  const kafkaBrokers = process.env.BROKER_URLS.split(',');
  const kafkaTopic = process.env.TOPIC_NAME;

  const kafka = new Kafka({
    clientId: 'myapp',
    brokers: kafkaBrokers,
    ssl: true,
  });

  const kafkaProducer = kafka.producer();
  await kafkaProducer.connect();
  await kafkaProducer.send({
    topic: kafkaTopic,
    messages: [{ value: 'Hello from MSK Integration test!' }],
  });

  await kafkaProducer.disconnect();

  return {
    statusCode: 200,
  };
}

module.exports = { producer, consumer };
