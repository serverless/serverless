'use strict';
// NOTE: `aws-iot-device-sdk-v2` is bundled into the deployment package
// eslint-disable-next-line import/no-unresolved
const { mqtt, io, iot, iotidentity } = require('aws-iot-device-sdk-v2');

const subscribe = (fn, channelName, isRejectionChannel) => {
  let subscription;
  const message = new Promise((resolve, reject) => {
    subscription = fn((error, response) => {
      if (response) {
        console.log(`${channelName} message: ${JSON.stringify(response)}`);
      }

      if (error || !response) {
        console.log(`Error occurred on channel ${channelName}.`);
        reject(error);
      } else {
        isRejectionChannel ? reject(response) : resolve(response);
      }
    });
  });
  return { subscription, message };
};

const executeKeys = async identity => {
  console.log('Subscribing to CreateKeysAndCertificate Accepted and Rejected topics..');

  const keysSubRequest = {};

  const createKeysAndCertificateAcceptedChannel = subscribe(
    identity.subscribeToCreateKeysAndCertificateAccepted.bind(
      identity,
      keysSubRequest,
      mqtt.QoS.AtLeastOnce
    ),
    'createKeysAndCertificateAccepted',
    false
  );
  const createKeysAndCertificateRejectedChannel = subscribe(
    identity.subscribeToCreateKeysAndCertificateRejected.bind(
      identity,
      keysSubRequest,
      mqtt.QoS.AtLeastOnce
    ),
    'createKeysAndCertificateRejected',
    true
  );

  await Promise.all([
    createKeysAndCertificateAcceptedChannel.subscription,
    createKeysAndCertificateRejectedChannel.subscription,
  ]);

  console.log('Publishing to CreateKeysAndCertificate topic..');
  const keysRequest = {
    toJSON() {
      return {};
    },
  };

  await identity.publishCreateKeysAndCertificate(keysRequest, mqtt.QoS.AtLeastOnce);

  return Promise.race([
    createKeysAndCertificateAcceptedChannel.message,
    createKeysAndCertificateRejectedChannel.message,
  ]);
};

const executeRegisterThing = async (identity, token) => {
  console.log('Subscribing to RegisterThing Accepted and Rejected topics..');

  const registerThingSubRequest = { templateName: process.env.TEMPLATE_NAME };
  const registerThingAcceptedChannel = subscribe(
    identity.subscribeToRegisterThingAccepted.bind(
      identity,
      registerThingSubRequest,
      mqtt.QoS.AtLeastOnce
    ),
    'registerThingAccepted',
    false
  );
  const registerThingRejectedChannel = subscribe(
    identity.subscribeToRegisterThingRejected.bind(
      identity,
      registerThingSubRequest,
      mqtt.QoS.AtLeastOnce
    ),
    'registerThingRejected',
    true
  );

  await Promise.all([
    registerThingAcceptedChannel.subscription,
    registerThingRejectedChannel.subscription,
  ]);

  console.log('Publishing to RegisterThing topic..');

  const registerThing = {
    parameters: {},
    templateName: process.env.TEMPLATE_NAME,
    certificateOwnershipToken: token,
  };
  await identity.publishRegisterThing(registerThing, mqtt.QoS.AtLeastOnce);

  return Promise.race([registerThingAcceptedChannel.message, registerThingRejectedChannel.message]);
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
