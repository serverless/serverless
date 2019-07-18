'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function createUserPool(name) {
  const cognito = new AWS.CognitoIdentityServiceProvider({ region });

  return cognito.createUserPool({ PoolName: name }).promise();
}

function deleteUserPool(name) {
  const cognito = new AWS.CognitoIdentityServiceProvider({ region });

  return findUserPoolByName(name).then(pool =>
    cognito.deleteUserPool({ UserPoolId: pool.Id }).promise()
  );
}

function findUserPoolByName(name) {
  const cognito = new AWS.CognitoIdentityServiceProvider({ region });

  const params = {
    MaxResults: 60,
  };

  function recursiveFind(nextToken) {
    if (nextToken) params.NextToken = nextToken;
    return cognito
      .listUserPools(params)
      .promise()
      .then(result => {
        const matches = result.UserPools.filter(pool => pool.Name === name);
        if (matches.length) {
          return matches.shift();
        }
        if (result.NextToken) return recursiveFind(result.NextToken);
        return null;
      });
  }

  return recursiveFind();
}

function createUser(userPoolId, username, password) {
  const cognito = new AWS.CognitoIdentityServiceProvider({ region });

  const params = {
    UserPoolId: userPoolId,
    Username: username,
    TemporaryPassword: password,
  };
  return cognito.adminCreateUser(params).promise();
}

module.exports = {
  createUserPool: persistentRequest.bind(this, createUserPool),
  deleteUserPool: persistentRequest.bind(this, deleteUserPool),
  findUserPoolByName: persistentRequest.bind(this, findUserPoolByName),
  createUser: persistentRequest.bind(this, createUser),
};
