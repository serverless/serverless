'use strict';
// NOTE: `aws-iot-device-sdk-v2` is bundled into the deployment package
// eslint-disable-next-line import/no-unresolved
const { mqtt, io, iot, iotidentity } = require('aws-iot-device-sdk-v2');

const subscriptionCallback = (error, response, channel, resolve, reject) => {
  if (response) {
    console.log(`${channel} successful message: ${JSON.stringify(response)}`);
  }

  if (error || !response) {
    console.log(`Error occurred on channel ${channel}.`);
    reject(error);
  } else {
    resolve(response);
  }
};

const executeKeys = async identity => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    try {
      console.log('Subscribing to CreateKeysAndCertificate Accepted and Rejected topics..');

      const keysSubRequest = {};

      await identity.subscribeToCreateKeysAndCertificateAccepted(
        keysSubRequest,
        mqtt.QoS.AtLeastOnce,
        (error, response) =>
          subscriptionCallback(
            error,
            response,
            'subscribeToCreateKeysAndCertificateAccepted',
            resolve,
            reject
          )
      );

      await identity.subscribeToCreateKeysAndCertificateRejected(
        keysSubRequest,
        mqtt.QoS.AtLeastOnce,
        (error, response) =>
          subscriptionCallback(
            error,
            response,
            'subscribeToCreateKeysAndCertificateRejected',
            resolve,
            reject
          )
      );

      console.log('Publishing to CreateKeysAndCertificate topic..');
      const keysRequest = {
        toJSON() {
          return {};
        },
      };

      await identity.publishCreateKeysAndCertificate(keysRequest, mqtt.QoS.AtLeastOnce);
    } catch (error) {
      reject(error);
    }
  });
};

const executeRegisterThing = async (identity, token) => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    try {
      console.log('Subscribing to RegisterThing Accepted and Rejected topics..');

      const registerThingSubRequest = { templateName: process.env.TEMPLATE_NAME };
      await identity.subscribeToRegisterThingAccepted(
        registerThingSubRequest,
        mqtt.QoS.AtLeastOnce,
        (error, response) =>
          subscriptionCallback(error, response, 'subscribeToRegisterThingAccepted', resolve, reject)
      );

      await identity.subscribeToRegisterThingRejected(
        registerThingSubRequest,
        mqtt.QoS.AtLeastOnce,
        (error, response) =>
          subscriptionCallback(error, response, 'subscribeToRegisterThingRejected', resolve, reject)
      );

      console.log('Publishing to RegisterThing topic..');

      const registerThing = {
        parameters: {},
        templateName: process.env.TEMPLATE_NAME,
        certificateOwnershipToken: token,
      };
      await identity.publishRegisterThing(registerThing, mqtt.QoS.AtLeastOnce);
    } catch (error) {
      reject(error);
    }
  });
};

module.exports.main = async ({ iotEndpoint, certificatePem, privateKey }) => {
  const clientBootstrap = new io.ClientBootstrap();
  const configBuilder = iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder(
    certificatePem,
    privateKey
  );
  configBuilder.with_clean_session(false);
  configBuilder.with_client_id(`test-${Math.floor(Math.random() * 100000000)}`);
  configBuilder.with_endpoint(iotEndpoint);

  // rce node to wait 60 seconds before killing itself, promises do not keep node alive
  const timer = setTimeout(() => {}, 60 * 1000);

  const config = configBuilder.build();
  const client = new mqtt.MqttClient(clientBootstrap);
  const connection = client.new_connection(config);

  const identity = new iotidentity.IotIdentityClient(connection);

  await connection.connect();
  const { certificateOwnershipToken: token } = await executeKeys(identity);
  await executeRegisterThing(identity, token);

  clearTimeout(timer);
};
