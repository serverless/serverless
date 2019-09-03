'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function createUserPool(name, config = {}) {
  const cognito = new AWS.CognitoIdentityServiceProvider({ region });

  const params = Object.assign({}, { PoolName: name }, config);
  return cognito.createUserPool(params).promise();
}

function createUserPoolClient(name, userPoolId) {
  const cognito = new AWS.CognitoIdentityServiceProvider({ region });

  const params = {
    ClientName: name,
    UserPoolId: userPoolId,
    ExplicitAuthFlows: ['USER_PASSWORD_AUTH'],
  };
  return cognito.createUserPoolClient(params).promise();
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

function describeUserPool(userPoolId) {
  const cognito = new AWS.CognitoIdentityServiceProvider({ region });

  return cognito.describeUserPool({ UserPoolId: userPoolId }).promise();
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

function setUserPassword(userPoolId, username, password) {
  const cognito = new AWS.CognitoIdentityServiceProvider({ region });

  const params = {
    UserPoolId: userPoolId,
    Username: username,
    Password: password,
    Permanent: true,
  };
  return cognito.adminSetUserPassword(params).promise();
}

function initiateAuth(clientId, username, password) {
  const cognito = new AWS.CognitoIdentityServiceProvider({ region });

  const params = {
    ClientId: clientId,
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  };
  return cognito.initiateAuth(params).promise();
}

module.exports = {
  createUserPool: persistentRequest.bind(this, createUserPool),
  deleteUserPool: persistentRequest.bind(this, deleteUserPool),
  findUserPoolByName: persistentRequest.bind(this, findUserPoolByName),
  describeUserPool: persistentRequest.bind(this, describeUserPool),
  createUserPoolClient: persistentRequest.bind(this, createUserPoolClient),
  createUser: persistentRequest.bind(this, createUser),
  setUserPassword: persistentRequest.bind(this, setUserPassword),
  initiateAuth: persistentRequest.bind(this, initiateAuth),
};
