'use strict';

const BbPromise = require('bluebird');
const fetch = require('node-fetch');
const isTrackingDisabled = require('./isTrackingDisabled');

// TODO: Replace me before release
const writeKey = 'XXXX';
const auth = `${writeKey}:`;

/* note segment call swallows errors */
function request(url, payload) {
  return fetch(url, {
    headers: {
      Authorization: `Basic ${new Buffer(auth).toString('base64')}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    timeout: '1000',
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then(() => BbPromise.resolve())
    .catch(() => BbPromise.resolve());
}

function track(payload) {
  const TRACKING_IS_DISABLED = isTrackingDisabled();
  // exit early is tracking disabled
  if (TRACKING_IS_DISABLED) {
    return BbPromise.resolve();
  }
  return request('https://api.segment.io/v1/track', payload);
}

module.exports = {
  track,
};
