'use strict';

/**
 * SNS Events
 */

let SError    = require('../../../ServerlessError'),
    BbPromise = require('bluebird');

module.exports.subscribe = function(awsConfig, event) {

  if (!awsConfig || !event.topicArn || !event.lambdaArn) {
    return BbPromise.reject(new SError(`Missing required event properties.`));
  }

  // if we're already subscribed, resolve.
  if (event.subscriptionArn) return BbPromise.resolve();

  const SNS = require('../SNS')(awsConfig);

  let params = {
    Protocol: 'lambda',
    TopicArn: event.topicArn,
    Endpoint: event.lambdaArn
  };

  return SNS.subscribePromised(params)
    .then(function(data) {
      // confirm subscription
      let params = {
        Token: data.token,
        TopicArn: event.topicArn,
        AuthenticateOnUnsubscribe: 'false'
      };
      return SNS.confirmSubscriptionPromised(params);
    });
};