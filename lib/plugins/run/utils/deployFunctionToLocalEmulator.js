'use strict';

const fetch = require('node-fetch');

function deployFunctionToLocalEmulator(serviceName, functionName, config, localEmulatorRootUrl) {
  const localEmulatorDeployEndpoint = `${localEmulatorRootUrl}/v0/emulator/api/deploy/${
    serviceName}/${functionName}`;

  return fetch(localEmulatorDeployEndpoint, {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    timeout: 1000,
    body: JSON.stringify(config),
  });
}

module.exports = deployFunctionToLocalEmulator;
