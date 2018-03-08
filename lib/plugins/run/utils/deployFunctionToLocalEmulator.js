'use strict';

const fetch = require('node-fetch');

function deployFunctionToLocalEmulator(functionId, functionConfig, emulatorUrl) {
  const localEmulatorDeployEndpoint = `${emulatorUrl}/v0/emulator/api/functions/deploy`;

  return fetch(localEmulatorDeployEndpoint, {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    timeout: 0, // NOTE using 0 so that deployments of large functions won't timeout
    body: JSON.stringify({
      functionId,
      functionConfig,
    }),
  });
}

module.exports = deployFunctionToLocalEmulator;
