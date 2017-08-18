'use strict';

const fetch = require('node-fetch');
const BbPromise = require('bluebird');

function eventGatewayRunning(eventGatewayRootUrl) {
  const eventGatewayStatusEndpoint = `${eventGatewayRootUrl}/v1/status`;

  return fetch(eventGatewayStatusEndpoint, {
    method: 'GET',
    timeout: 1000,
  }).then(res => res.ok)
    .catch(() => BbPromise.resolve(false));
}

module.exports = eventGatewayRunning;
