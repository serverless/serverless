'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function publishIotData(topic, message) {
  const Iot = new AWS.Iot({ region });

  return Iot.describeEndpoint().promise()
    .then(data => {
      const IotData = new AWS.IotData({ region, endpoint: data.endpointAddress });

      const params = {
        topic,
        payload: Buffer.from(message),
      };

      return IotData.publish(params).promise();
    });
}

module.exports = {
  publishIotData: persistentRequest.bind(this, publishIotData),
};
