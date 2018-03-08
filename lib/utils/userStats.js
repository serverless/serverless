'use strict';

/* eslint-disable no-console */

const BbPromise = require('bluebird');
const _ = require('lodash');
const fetch = require('node-fetch');
const configUtils = require('./config');
const isTrackingDisabled = require('./isTrackingDisabled');
const isValidEventName = require('./userStatsValidation');

const TRACK_URL = 'https://serverless.com/api/framework/track';
const IDENTIFY_URL = 'https://serverless.com/api/framework/identify';
const DEBUG = false;

function debug() {
  if (DEBUG) console.log(arguments);
}

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
  const data = payload || {};
  let userId = data.id;
  let userEmail = data.email;

  const TRACKING_IS_DISABLED = isTrackingDisabled();

  // exit early if tracking disabled
  if (TRACKING_IS_DISABLED && !data.force) {
    debug('abort .track call TRACKING_IS_DISABLED');
    return BbPromise.resolve();
  }

  const config = configUtils.getConfig();
  const frameworkId = config.frameworkId;
  // getConfig for values if not provided from .track call
  if (!userId || !userEmail) {
    userId = config.userId;
    if (config.users && config.users[userId] && config.users[userId].email) {
      userEmail = config.users[userId].email;
    }
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
    frameworkId,
    email: userEmail,
    data: {
      id: userId,
      timestamp: Math.round(+new Date() / 1000),
    },
  };

  delete data.force;
  const eventData = _.merge(defaultData, data);
  if (DEBUG) {
    debug('.track call', eventData);
    return BbPromise.resolve();
  }
  return request(TRACK_URL, eventData);
}

function identify(payload) {
  const TRACKING_IS_DISABLED = isTrackingDisabled();
  const data = payload || {};

  if (TRACKING_IS_DISABLED && !data.force) {
    if (DEBUG) {
      console.log('abort .identify call');
    }
    // exit early is tracking disabled
    return BbPromise.resolve();
  }
  delete data.force;
  if (DEBUG) {
    console.log('.identify call', data);
    return BbPromise.resolve();
  }
  return request(IDENTIFY_URL, data);
}

module.exports = {
  track,
  identify,
};
