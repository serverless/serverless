'use strict';
// NOTE: `aws-iot-device-sdk-v2` is bundled into the deployment package
// eslint-disable-next-line import/no-unresolved
const { mqtt, io, iot, iotidentity } = require('aws-iot-device-sdk-v2');

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const subscribe = (fn, deffered, options) => {
  const { resolve, reject } = deffered;
  const { channelName, isRejectionChannel } = Object.assign(
    {
      channelName: 'DefaultChannel',
      isRejectionChannel: false,
    },
    options
  );

  return fn((error, response) => {
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
};

const executeKeys = async (identity) => {
  console.log('Subscribing to CreateKeysAndCertificate Accepted and Rejected topics..');

  const keysSubRequest = {};

  const createKeysAndCertificateDefferedMessage = createDeferred();
  const createKeysAndCertificateAcceptedChannelSubscription = subscribe(
    identity.subscribeToCreateKeysAndCertificateAccepted.bind(
      identity,
      keysSubRequest,
      mqtt.QoS.AtLeastOnce
    ),
    createKeysAndCertificateDefferedMessage,
    { channelName: 'CreateKeysAndCertificateAcceptedChannel', isRejectionChannel: false }
  );
  const createKeysAndCertificateRejectedChannelSubscription = subscribe(
    identity.subscribeToCreateKeysAndCertificateRejected.bind(
      identity,
      keysSubRequest,
      mqtt.QoS.AtLeastOnce
    ),
    createKeysAndCertificateDefferedMessage,
    { channelName: 'CreateKeysAndCertificateRejectedChannel', isRejectionChannel: true }
  );

  await Promise.all([
    createKeysAndCertificateAcceptedChannelSubscription,
    createKeysAndCertificateRejectedChannelSubscription,
  ]);

  console.log('Publishing to CreateKeysAndCertificate topic..');
  const keysRequest = {
    toJSON() {
      return {};
    },
  };

  await identity.publishCreateKeysAndCertificate(keysRequest, mqtt.QoS.AtLeastOnce);

  return createKeysAndCertificateDefferedMessage.promise;
};

const executeRegisterThing = async (identity, token) => {
  console.log('Subscribing to RegisterThing Accepted and Rejected topics..');

  const registerThingSubRequest = { templateName: process.env.TEMPLATE_NAME };
  const registerThingDefferedMessage = createDeferred();
  const registerThingAcceptedChannelSubscription = subscribe(
    identity.subscribeToRegisterThingAccepted.bind(
      identity,
      registerThingSubRequest,
      mqtt.QoS.AtLeastOnce
    ),
    registerThingDefferedMessage,
    { channelName: 'RegisterThingAcceptedChannel', isRejectionChannel: false }
  );
  const registerThingRejectedChannelSubscription = subscribe(
    identity.subscribeToRegisterThingRejected.bind(
      identity,
      registerThingSubRequest,
      mqtt.QoS.AtLeastOnce
    ),
    registerThingDefferedMessage,
    { channelName: 'RegisterThingRejectedChannel', isRejectionChannel: true }
  );

  await Promise.all([
    registerThingAcceptedChannelSubscription,
    registerThingRejectedChannelSubscription,
  ]);

  console.log('Publishing to RegisterThing topic..');

  const registerThing = {
    parameters: {},
    templateName: process.env.TEMPLATE_NAME,
    certificateOwnershipToken: token,
  };
  await identity.publishRegisterThing(registerThing, mqtt.QoS.AtLeastOnce);

  return registerThingDefferedMessage.promise;
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

  // MqttClient and IotIdentityClient async operations do not keep node process alive
  // We need to issue a keep alive timer so process does not die
  const keepAliveTimer = setTimeout(() => {}, 60 * 60 * 1000);

  const config = configBuilder.build();
  const client = new mqtt.MqttClient(clientBootstrap);
  const connection = client.new_connection(config);

  const identity = new iotidentity.IotIdentityClient(connection);

  await connection.connect();
  const { certificateOwnershipToken: token, certificateId } = await executeKeys(identity);
  const { thingName } = await executeRegisterThing(identity, token);
  clearTimeout(keepAliveTimer);

  return { certificateId, thingName };
};
