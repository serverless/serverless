'use strict';

const fetch = require('node-fetch');
const BbPromise = require('bluebird');

function localEmulatorRunning(localEmulatorRootUrl) {
  const localEmulatorHeartbeatEndpoint = `${localEmulatorRootUrl}/v0/emulator/api/utils/heartbeat`;
  const timestamp = (+new Date());
  const payload = {
    ping: timestamp,
  };

  return fetch(localEmulatorHeartbeatEndpoint, {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    timeout: 1000,
    body: JSON.stringify(payload),
  }).then(res => res.json())
    .then(json => {
      if (json.pong === timestamp) {
        return BbPromise.resolve(true);
      }
      return BbPromise.resolve(false);
    }).catch(() => BbPromise.resolve(false));
}

module.exports = localEmulatorRunning;
