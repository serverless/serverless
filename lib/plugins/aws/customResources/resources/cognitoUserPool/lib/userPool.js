'use strict';

const { awsRequest } = require('../../utils');

function getUpdateConfigFromCurrentSetup(currentSetup) {
  const updatedConfig = Object.assign({}, currentSetup);
  delete updatedConfig.Id;
  delete updatedConfig.Name;
  delete updatedConfig.Status;
  delete updatedConfig.LastModifiedDate;
  delete updatedConfig.CreationDate;
  delete updatedConfig.SchemaAttributes;
  delete updatedConfig.AliasAttributes;
  delete updatedConfig.UsernameAttributes;
  delete updatedConfig.EstimatedNumberOfUsers;
  delete updatedConfig.SmsConfigurationFailure;
  delete updatedConfig.EmailConfigurationFailure;
  delete updatedConfig.Domain;
  delete updatedConfig.CustomDomain;
  delete updatedConfig.UsernameConfiguration;
  delete updatedConfig.Arn;
  // necessary reassignments
  updatedConfig.Policies.PasswordPolicy.TemporaryPasswordValidityDays =
    updatedConfig.AdminCreateUserConfig.UnusedAccountValidityDays;
  delete updatedConfig.AdminCreateUserConfig.UnusedAccountValidityDays;
  return updatedConfig;
}

async function findUserPoolByName(config) {
  const { userPoolName, region } = config;

  const payload = {
    MaxResults: 60,
  };

  async function recursiveFind(nextToken) {
    if (nextToken) payload.NextToken = nextToken;
    return awsRequest(
      { name: 'CognitoIdentityServiceProvider', params: { region } },
      'listUserPools',
      payload
    ).then((result) => {
      const matches = result.UserPools.filter((pool) => pool.Name === userPoolName);
      if (matches.length) {
        return matches.shift();
      }
      if (result.NextToken) return recursiveFind(result.NextToken);
      return null;
    });
  }

  return recursiveFind();
}

async function getConfiguration(config) {
  const { region } = config;

  return findUserPoolByName(config).then((userPool) =>
    awsRequest({ name: 'CognitoIdentityServiceProvider', params: { region } }, 'describeUserPool', {
      UserPoolId: userPool.Id,
    })
  );
}

async function updateConfiguration(config) {
  const { lambdaArn, userPoolConfigs, region } = config;

  return getConfiguration(config).then((res) => {
    const UserPoolId = res.UserPool.Id;
    let { LambdaConfig } = res.UserPool;
    // remove configurations for this specific function
    LambdaConfig = Object.keys(LambdaConfig).reduce((accum, key) => {
      if (LambdaConfig[key] === lambdaArn) delete accum[key];
      return accum;
    }, LambdaConfig);

    userPoolConfigs.forEach((poolConfig) => {
      LambdaConfig[poolConfig.Trigger] = lambdaArn;
    });

    const updatedConfig = getUpdateConfigFromCurrentSetup(res.UserPool);
    Object.assign(updatedConfig, {
      UserPoolId,
      LambdaConfig,
    });

    return awsRequest(
      { name: 'CognitoIdentityServiceProvider', params: { region } },
      'updateUserPool',
      updatedConfig
    );
  });
}

async function removeConfiguration(config) {
  const { lambdaArn, region } = config;

  return getConfiguration(config).then((res) => {
    const UserPoolId = res.UserPool.Id;
    let { LambdaConfig } = res.UserPool;
    // remove configurations for this specific function
    LambdaConfig = Object.keys(LambdaConfig).reduce((accum, key) => {
      if (LambdaConfig[key] === lambdaArn) delete accum[key];
      return accum;
    }, LambdaConfig);

    const updatedConfig = getUpdateConfigFromCurrentSetup(res.UserPool);
    Object.assign(updatedConfig, {
      UserPoolId,
      LambdaConfig,
    });

    return awsRequest(
      { name: 'CognitoIdentityServiceProvider', params: { region } },
      'updateUserPool',
      updatedConfig
    );
  });
}

module.exports = {
  findUserPoolByName,
  updateConfiguration,
  removeConfiguration,
};
