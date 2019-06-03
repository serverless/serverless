'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function getCognitoUserPoolId(userPoolName) {
  const cisp = new AWS.CognitoIdentityServiceProvider({ region });

  const params = {
    MaxResults: 50,
  };

  return cisp.listUserPools(params).promise()
    .then((data) => data.UserPools.find((userPool) =>
      RegExp(userPoolName, 'g').test(userPool.Name)).Id
    );
}

function createCognitoUser(userPoolId, username, password) {
  const cisp = new AWS.CognitoIdentityServiceProvider({ region });

  const params = {
    UserPoolId: userPoolId,
    Username: username,
    TemporaryPassword: password,
  };
  return cisp.adminCreateUser(params).promise();
}

module.exports = {
  getCognitoUserPoolId: persistentRequest.bind(this, getCognitoUserPoolId),
  createCognitoUser: persistentRequest.bind(this, createCognitoUser),
};
