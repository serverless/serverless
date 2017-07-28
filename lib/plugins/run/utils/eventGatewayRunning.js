'use strict';

const fetch = require('node-fetch');
const BbPromise = require('bluebird');

function eventGatewayRunning() {
  const localEmulatorPingEndpoint = 'http://localhost:8080/ping';

  return fetch(localEmulatorPingEndpoint, {
    method: 'GET',
    timeout: 1000,
  }).then(res => res.json())
    .then(json => {
      if (json.id === 'serverless-local-emulator') {
        return BbPromise.resolve(true);
      }
      return BbPromise.resolve(false);
    }).catch(() => BbPromise.resolve(false));
}

module.exports = eventGatewayRunning;
