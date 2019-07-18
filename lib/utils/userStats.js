'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const configUtils = require('./config');
const isValidEventName = require('./userStatsValidation');
const { track } = require('./tracking');

module.exports.track = (eventName, payload) => {
  return BbPromise.try(() => {
    const data = payload || {};
    let userId = data.id;
    let userEmail = data.email;
    const isForced = data.force;
    delete data.force;

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
    if (eventName.indexOf('framework:') === -1) eventName = `framework:${eventName}`;

    // to ensure clean data, validate event name
    if (!isValidEventName(eventName)) return null;

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

    return track('user', _.merge(defaultData, data), { isForced });
  });
};
