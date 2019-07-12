'use strict';

const AWS = require('aws-sdk');

function findRuleByName(config) {
  const { eventBusName, ruleName, region } = config;
  const eventBridge = new AWS.EventBridge({ region });

  const params = {
    EventBusName: eventBusName,
    Limit: 500,
  };

  function recursiveFind(nextToken) {
    if (nextToken) params.NextToken = nextToken;
    return eventBridge
      .listRules(params)
      .promise()
      .then(result => {
        const matches = result.Rules.filter(rule => rule.Name === ruleName);
        if (matches.length) {
          return matches.shift();
        }
        if (result.NextToken) return recursiveFind(false, result.NextToken);
        return null;
      });
  }

  return recursiveFind();
}

function getRuleConfiguration(config) {
  const { eventBusName, region } = config;
  const eventBridge = new AWS.EventBridge({ region });

  return findRuleByName(config).then(rule =>
    eventBridge
      .describeRule({
        Name: rule.Name,
        EventBusName: eventBusName,
      })
      .promise()
      .then(data => data)
  );
}

// --- WIP

function updateRuleConfiguration(config) {
  const { lambdaArn, userPoolConfig, region } = config;
  const eventBus = new AWS.EventBus({ region });

  return getRuleConfiguration(config).then(res => {
    const UserPoolId = res.UserPool.Id;
    let { LambdaConfig } = res.UserPool;
    // remove configurations for this specific function
    LambdaConfig = Object.keys(LambdaConfig).reduce((accum, key) => {
      if (LambdaConfig[key] === lambdaArn) delete accum[key];
      return accum;
    }, LambdaConfig);

    LambdaConfig[userPoolConfig.Trigger] = lambdaArn;

    return cognito.updateUserPool({ UserPoolId, LambdaConfig }).promise();
  });
}

function removeConfiguration(config) {
  const { lambdaArn, region } = config;
  const cognito = new AWS.CognitoIdentityServiceProvider({ region });

  return getConfiguration(config).then(res => {
    const UserPoolId = res.UserPool.Id;
    let { LambdaConfig } = res.UserPool;
    // remove configurations for this specific function
    LambdaConfig = Object.keys(LambdaConfig).reduce((accum, key) => {
      if (LambdaConfig[key] === lambdaArn) delete accum[key];
      return accum;
    }, LambdaConfig);

    return cognito.updateUserPool({ UserPoolId, LambdaConfig }).promise();
  });
}

module.exports = {
  findUserPoolByName,
  updateConfiguration,
  removeConfiguration,
};
