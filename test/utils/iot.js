'use strict';

const awsRequest = require('@serverless/test/aws-request');

function resolveIotEndpoint() {
  return awsRequest('Iot', 'describeEndpoint').then((data) => {
    return data.endpointAddress;
  });
}

function publishIotData(topic, message) {
  return resolveIotEndpoint().then((endpoint) => {
    const params = {
      topic,
      payload: Buffer.from(message),
    };

    return awsRequest({ name: 'IotData', params: { endpoint } }, 'publish', params);
  });
}

module.exports = {
  resolveIotEndpoint,
  publishIotData,
};
