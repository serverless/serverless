'use strict';

// NOTE: `aws-iot-device-sdk-v2` is bundled into the deployment package
// eslint-disable-next-line import/no-unresolved
const { mqtt, io, iot, iotidentity } = require('aws-iot-device-sdk-v2');

async function executeKeys(identity) {
  return new Promise((resolve, reject) => {
    try {
      const keysAccepted = (error, response) => {
        if (response) {
          resolve(response.certificateOwnershipToken);
        }
        reject(error);
      };

      const keysRejected = (error, response) => {
        if (response) {
          reject(response);
        }
        reject(error);
      };

      const subscsribeAccepted = identity.subscribeToCreateKeysAndCertificateAccepted(
        {},
        mqtt.QoS.AtLeastOnce,
        keysAccepted
      );
      const subscsribeRejected = identity.subscribeToCreateKeysAndCertificateRejected(
        {},
        mqtt.QoS.AtLeastOnce,
        keysRejected
      );

      Promise.all([subscsribeAccepted, subscsribeRejected]).then(() => {
        identity.publishCreateKeysAndCertificate(
          {
            toJSON() {
              return {};
            },
          },
          mqtt.QoS.AtLeastOnce
        );
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function executeRegisterThing(identity, token) {
  return new Promise((resolve, reject) => {
    try {
      const registerAccepted = (error, response) => {
        if (response) {
          resolve();
        }
        reject(error);
      };

      const registerRejected = (error, response) => {
        if (response) {
          reject(response);
        }
        reject(error);
      };

      const subscribeAccepted = identity.subscribeToRegisterThingAccepted(
        { templateName: process.env.TEMPLATE_NAME },
        mqtt.QoS.AtLeastOnce,
        registerAccepted
      );
      const subscribeRejected = identity.subscribeToRegisterThingRejected(
        { templateName: process.env.TEMPLATE_NAME },
        mqtt.QoS.AtLeastOnce,
        registerRejected
      );
      Promise.all([subscribeAccepted, subscribeRejected]).then(() => {
        identity.publishRegisterThing(
          {
            parameters: {},
            templateName: process.env.TEMPLATE_NAME,
            certificateOwnershipToken: token,
          },
          mqtt.QoS.AtLeastOnce
        );
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function connect(config) {
  return new Promise((resolve, reject) => {
    try {
      const clientBootstrap = new io.ClientBootstrap();
      const client = new mqtt.MqttClient(clientBootstrap);
      const connection = client.new_connection(config);
      const identity = new iotidentity.IotIdentityClient(connection);
      connection.connect().then(() => {
        resolve(identity);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function registerDevice(event) {
  io.enable_logging(io.LogLevel.TRACE);

  const config = iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder(
    event.certificatePem,
    event.keyPair.PrivateKey
  )
    .with_clean_session(false)
    .with_client_id('test')
    .with_endpoint(event.iotEndpoint)
    .build();

  const identity = await connect(config);
  const token = await executeKeys(identity);
  await executeRegisterThing(identity, token);

  return 'success';
}

function iotFleetPreProvisioningHook(event) {
  return event;
}

module.exports = { registerDevice, iotFleetPreProvisioningHook };
