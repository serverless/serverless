'use strict';

const AWS = require('aws-sdk');
const _ = require('lodash');
const { region, persistentRequest } = require('../misc');

function createRestApi(name) {
  const APIG = new AWS.APIGateway({ region });

  const params = {
    name,
  };

  return APIG.createRestApi(params).promise();
}

function deleteRestApi(restApiId) {
  const APIG = new AWS.APIGateway({ region });

  const params = {
    restApiId,
  };

  return APIG.deleteRestApi(params).promise();
}

function getResources(restApiId) {
  const APIG = new AWS.APIGateway({ region });

  const params = {
    restApiId,
  };

  return APIG.getResources(params).promise()
    .then((data) => data.items);
}

function findRestApis(name) {
  const APIG = new AWS.APIGateway({ region });

  const params = {
    limit: 500,
  };

  function recursiveFind(found, position) {
    if (position) params.position = position;
    return APIG.getRestApis(params).promise().then(result => {
      const matches = result.items.filter(restApi => restApi.name.match(name));
      if (matches.length) {
        _.merge(found, matches);
      }
      if (result.position) return recursiveFind(found, result.position);
      return found;
    });
  }

  return recursiveFind([]);
}

module.exports = {
  createRestApi: persistentRequest.bind(this, createRestApi),
  deleteRestApi: persistentRequest.bind(this, deleteRestApi),
  getResources: persistentRequest.bind(this, getResources),
  findRestApis: persistentRequest.bind(this, findRestApis),
};
