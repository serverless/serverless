const BbPromise = require('bluebird');
const fetch = require('node-fetch');
// TODO: Replace me before release
const writeKey = 'XXXX';
const auth = `${writeKey}:`;

function request(url, payload) {
  return fetch('https://api.segment.io/v1/track', {
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
  return request('https://api.segment.io/v1/track', payload);
}

function alias(payload) {
  return request('https://api.segment.io/v1/alias', payload);
}

module.exports = {
  track,
  alias,
};
