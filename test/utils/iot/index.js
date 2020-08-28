'use strict';

const awsRequest = require('@serverless/test/aws-request');

function publishIotData(topic, message) {
  return awsRequest('Iot', 'describeEndpoint').then(data => {
    const params = {
      topic,
      payload: Buffer.from(message),
    };

    return awsRequest(
      { name: 'IotData', params: { endpoint: data.endpointAddress } },
      'publish',
      params
    );
  });
}

module.exports = {
  publishIotData,
};
