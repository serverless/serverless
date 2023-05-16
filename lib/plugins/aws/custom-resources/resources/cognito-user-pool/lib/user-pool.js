'use strict';

const { awsRequest } = require('../../utils');

const customSenderSources = ['CustomSMSSender', 'CustomEmailSender'];

const KMSKeyID = 'KMSKeyID';

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
    LambdaConfig = removeExistingLambdas(LambdaConfig, lambdaArn);

    userPoolConfigs.forEach((poolConfig) => {
      if (customSenderSources.includes(poolConfig.Trigger)) {
        LambdaConfig[poolConfig.Trigger] = {
          LambdaArn: lambdaArn,
          LambdaVersion: poolConfig.LambdaVersion,
        };
        LambdaConfig.KMSKeyID = poolConfig.KMSKeyID;
      } else {
        LambdaConfig[poolConfig.Trigger] = lambdaArn;
      }
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
    LambdaConfig = removeExistingLambdas(LambdaConfig, lambdaArn);

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

function removeExistingLambdas(lambdaConfig, lambdaArn) {
  const res = Object.fromEntries(
    Object.entries(lambdaConfig).filter(([key, value]) => {
      return (
        !(customSenderSources.includes(key) && value.LambdaArn === lambdaArn) && value !== lambdaArn
      );
    })
  );
  // if there are no customSenderSources also delete KMSKeyId
  if (KMSKeyID in res && customSenderSources.every((source) => !(source in res))) {
    delete res[KMSKeyID];
  }
  return res;
}

module.exports = {
  findUserPoolByName,
  updateConfiguration,
  removeConfiguration,
};
