'use strict';

const BbPromise = require('bluebird');
const fetch = require('node-fetch');
const path = require('path');
const isTrackingDisabled = require('./isTrackingDisabled');
const readFileIfExists = require('./fs/readFileIfExists');
const getTrackingConfigFileName = require('./getTrackingConfigFileName');

/* note segment call swallows errors */
function request(url, payload) {
  const trackingConfigFilePath = path.join(__dirname, '..', '..', getTrackingConfigFileName());
  return readFileIfExists(trackingConfigFilePath).then(trackingConfig => {
    // exit if segment write key does not exist
    if (!trackingConfig) {
      return BbPromise.resolve();
    }

    const auth = trackingConfig.segmentWriteKey;
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
      .then(() => BbPromise.resolve());
  }).catch(() => BbPromise.resolve());
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
