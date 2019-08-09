'use strict';

const CognitoIdentityServiceProvider = require('aws-sdk/clients/cognitoidentityserviceprovider');

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
  delete updatedConfig.Arn;
  // necessary reassignments
  updatedConfig.Policies.PasswordPolicy.TemporaryPasswordValidityDays =
    updatedConfig.AdminCreateUserConfig.UnusedAccountValidityDays;
  delete updatedConfig.AdminCreateUserConfig.UnusedAccountValidityDays;
  return updatedConfig;
}

function findUserPoolByName(config) {
  const { userPoolName, region } = config;
  const cognito = new CognitoIdentityServiceProvider({ region });

  const params = {
    MaxResults: 60,
  };

  function recursiveFind(nextToken) {
    if (nextToken) params.NextToken = nextToken;
    return cognito
      .listUserPools(params)
      .promise()
      .then(result => {
        const matches = result.UserPools.filter(pool => pool.Name === userPoolName);
        if (matches.length) {
          return matches.shift();
        }
        if (result.NextToken) return recursiveFind(result.NextToken);
        return null;
      });
  }

  return recursiveFind();
}

function getConfiguration(config) {
  const { region } = config;
  const cognito = new CognitoIdentityServiceProvider({ region });

  return findUserPoolByName(config).then(userPool =>
    cognito
      .describeUserPool({
        UserPoolId: userPool.Id,
      })
      .promise()
  );
}

function updateConfiguration(config) {
  const { lambdaArn, userPoolConfigs, region } = config;
  const cognito = new CognitoIdentityServiceProvider({ region });

  return getConfiguration(config).then(res => {
    const UserPoolId = res.UserPool.Id;
    let { LambdaConfig } = res.UserPool;
    // remove configurations for this specific function
    LambdaConfig = Object.keys(LambdaConfig).reduce((accum, key) => {
      if (LambdaConfig[key] === lambdaArn) delete accum[key];
      return accum;
    }, LambdaConfig);

    userPoolConfigs.forEach(poolConfig => {
      LambdaConfig[poolConfig.Trigger] = lambdaArn;
    });

    const updatedConfig = getUpdateConfigFromCurrentSetup(res.UserPool);
    Object.assign(updatedConfig, {
      UserPoolId,
      LambdaConfig,
    });

    return cognito.updateUserPool(updatedConfig).promise();
  });
}

function removeConfiguration(config) {
  const { lambdaArn, region } = config;
  const cognito = new CognitoIdentityServiceProvider({ region });

  return getConfiguration(config).then(res => {
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

    return cognito.updateUserPool(updatedConfig).promise();
  });
}

module.exports = {
  findUserPoolByName,
  updateConfiguration,
  removeConfiguration,
};
