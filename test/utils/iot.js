'use strict';

const awsRequest = require('@serverless/test/aws-request');
const IotService = require('aws-sdk').Iot;
const IotDataService = require('aws-sdk').IotData;

async function resolveIotEndpoint() {
  return awsRequest(IotService, 'describeEndpoint', { endpointType: 'iot:Data-ATS' }).then(
    (data) => {
      return data.endpointAddress;
    }
  );
}

async function publishIotData(topic, message) {
  return resolveIotEndpoint().then((endpoint) => {
    const params = {
      topic,
      payload: Buffer.from(message),
    };

    return awsRequest({ client: IotDataService, params: { endpoint } }, 'publish', params);
  });
}

module.exports = {
  resolveIotEndpoint,
  publishIotData,
};
