'use strict';

const fetch = require('node-fetch');

function deployFunctionToLocalEmulator(serviceName, functionName, config) {
  const localEmulatorDeployEndpoint = '';
  const payload = {
    serviceName,
    functionName,
    config,
  };

  return fetch(localEmulatorDeployEndpoint, {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    timeout: '1000',
    body: JSON.stringify(payload),
  });
}

module.exports = deployFunctionToLocalEmulator;
