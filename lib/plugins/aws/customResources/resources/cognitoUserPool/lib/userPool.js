'use strict';

const CognitoIdentityServiceProvider = require('aws-sdk/clients/cognitoidentityserviceprovider');

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
  const { lambdaArn, userPoolConfig, region } = config;
  const cognito = new CognitoIdentityServiceProvider({ region });

  return getConfiguration(config).then(res => {
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
  const cognito = new CognitoIdentityServiceProvider({ region });

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
