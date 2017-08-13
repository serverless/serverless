'use strict';

const fetch = require('node-fetch');

function deployFunctionToLocalEmulator(functionId, functionConfig, emulatorUrl) {
  const localEmulatorDeployEndpoint = `${emulatorUrl}/v0/emulator/api/function/deploy`;

  return fetch(localEmulatorDeployEndpoint, {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    timeout: 10000,
    body: JSON.stringify({
      functionId,
      functionConfig,
    }),
  });
}

module.exports = deployFunctionToLocalEmulator;
