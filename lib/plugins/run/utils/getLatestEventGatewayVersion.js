'use strict';

const fetch = require('node-fetch');

function getLatestEventGatewayVersion() {
  const url = 'https://api.github.com/repos/serverless/event-gateway/releases/latest';

  return fetch(url, {
    method: 'GET',
    timeout: 10000,
  }).then(res => res.json())
    .then(json => json.name);
}

module.exports = getLatestEventGatewayVersion;
