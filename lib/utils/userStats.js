'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const fetch = require('node-fetch');
const configUtils = require('./config');
const isTrackingDisabled = require('./isTrackingDisabled');
const isValidEventName = require('./userStatsValidation');

const config = configUtils.getConfig();
const TRACKING_IS_DISABLED = isTrackingDisabled();
const TRACK_URL = 'https://serverless.com/api/framework/track';
const IDENTIFY_URL = 'https://serverless.com/api/framework/identify';

/* note tracking swallows errors */
function request(url, payload) {
  return fetch(url, {
    method: 'POST',
    timeout: '1000',
    body: JSON.stringify(payload),
  })
  .then((response) => {
    if (response.status === 404) {
      return BbPromise.reject('404 api not found');
    }
    return response.json();
  })
  .then((res) => BbPromise.resolve(res))
  .catch((e) => {
    console.log('SLS Tracking Error, Please update to latest version of framework with `npm i serverless -g`'); // eslint-disable-line
    return BbPromise.resolve(e);
  });
}

function track(eventName, payload) {
  const data = payload || {};
  const userId = data.id || config.userId;

  // automatically add `framework:` prefix
  if (eventName.indexOf('framework:') === -1) {
    eventName = `framework:${eventName}`; // eslint-disable-line
  }

  // exit early if tracking disabled
  if (TRACKING_IS_DISABLED || !userId) {
    console.log('abort track');
    return BbPromise.resolve();
  }

  // exit early if no email found
  if ((config.users && config.users[userId] && !config.users[userId].email)) {
    return BbPromise.resolve();
  }

  // to ensure clean data, validate event name
  if (!isValidEventName(eventName)) {
    return BbPromise.resolve();
  }

  const defaultData = {
    event: eventName,
    id: userId,
    email: config.users[userId].email,
    data: {
      id: userId,
      timestamp: Math.round(+new Date() / 1000),
    },
  };

  const eventData = _.merge(defaultData, data);
  console.log('run track in framework', eventData);
  // return BbPromise.resolve();
  return request(TRACK_URL, eventData);
}

function identify(payload) {
  if (TRACKING_IS_DISABLED) {
    console.log('abort track');
    // exit early is tracking disabled
    return BbPromise.resolve();
  }
  console.log('run identify in framework');
  return request(IDENTIFY_URL, payload);
}

module.exports = {
  track,
  identify,
};
