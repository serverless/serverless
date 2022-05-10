'use strict';

const _ = require('lodash');
const awsRequest = require('@serverless/test/aws-request');
const APIGatewayService = require('aws-sdk').APIGateway;

function createRestApi(name) {
  const params = {
    name,
  };

  return awsRequest(APIGatewayService, 'createRestApi', params);
}

function deleteRestApi(restApiId) {
  const params = {
    restApiId,
  };

  return awsRequest(APIGatewayService, 'deleteRestApi', params);
}

function getResources(restApiId) {
  const params = {
    restApiId,
  };

  return awsRequest(APIGatewayService, 'getResources', params).then((data) => data.items);
}

function findRestApis(name) {
  const params = {
    limit: 500,
  };

  function recursiveFind(found, position) {
    if (position) params.position = position;
    return awsRequest(APIGatewayService, 'getRestApis', params).then((result) => {
      const matches = result.items.filter((restApi) => restApi.name.match(name));
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
  createRestApi,
  deleteRestApi,
  getResources,
  findRestApis,
};
