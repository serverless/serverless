'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const fetch = require('node-fetch');
const configUtils = require('./config');
const isTrackingDisabled = require('./isTrackingDisabled');
const isValidEventName = require('./userStatsValidation');

const TRACKING_IS_DISABLED = isTrackingDisabled();
const TRACK_URL = 'https://serverless.com/api/framework/track';
const IDENTIFY_URL = 'https://serverless.com/api/framework/identify';
const DEBUG = false;

/* note tracking swallows errors */
function request(url, payload) {
  return fetch(url, {
    method: 'POST',
    // set to 1000 b/c no response needed
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
  .catch((e) => BbPromise.resolve(e));
}

function track(eventName, payload) {
  // exit early if tracking disabled
  if (TRACKING_IS_DISABLED) {
    if (DEBUG) {
      console.log('abort .track call'); // eslint-disable-line
    }
    return BbPromise.resolve();
  }
  const data = payload || {};
  let userId = data.id;
  let userEmail = data.email;

  // getConfig for values if not provided from .track call
  if (!userId || !userEmail) {
    const config = configUtils.getConfig();
    userId = config.userId;
    if (config.users && config.users[userId] && !config.users[userId].email) {
      // exit early if no user data or email found
      return BbPromise.resolve();
    }
    userEmail = config.users[userId].email;
  }

  // automatically add `framework:` prefix
  if (eventName.indexOf('framework:') === -1) {
    eventName = `framework:${eventName}`; // eslint-disable-line
  }

  // to ensure clean data, validate event name
  if (!isValidEventName(eventName)) {
    return BbPromise.resolve();
  }

  const defaultData = {
    event: eventName,
    id: userId,
    email: userEmail,
    data: {
      id: userId,
      timestamp: Math.round(+new Date() / 1000),
    },
  };

  const eventData = _.merge(defaultData, data);
  if (DEBUG) {
    console.log('.track call', eventData); // eslint-disable-line
  }
  // return BbPromise.resolve();
  return request(TRACK_URL, eventData);
}

function identify(payload) {
  if (TRACKING_IS_DISABLED) {
    if (DEBUG) {
      console.log('abort .identify call'); // eslint-disable-line
    }
    // exit early is tracking disabled
    return BbPromise.resolve();
  }
  if (DEBUG) {
    console.log('.identify call', payload); // eslint-disable-line
  }
  return request(IDENTIFY_URL, payload);
}

module.exports = {
  track,
  identify,
};
