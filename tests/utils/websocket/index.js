'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function createApi(name) {
  const APIG = new AWS.ApiGatewayV2({ region });

  return APIG.createApi({
    Name: name,
    ProtocolType: 'WEBSOCKET',
    RouteSelectionExpression: '$request.body.action',
  }).promise();
}

function createStage(apiId, stageName) {
  const APIG = new AWS.ApiGatewayV2({ region });

  const params = {
    ApiId: apiId,
    StageName: stageName,
  };
  return APIG.createStage(params).promise();
}

function deleteApi(id) {
  const APIG = new AWS.ApiGatewayV2({ region });

  return APIG.deleteApi({
    ApiId: id,
  }).promise();
}

function deleteStage(apiId, stageName) {
  const APIG = new AWS.ApiGatewayV2({ region });

  const params = {
    ApiId: apiId,
    StageName: stageName,
  };
  return APIG.deleteStage(params).promise();
}

function getRoutes(apiId) {
  const APIG = new AWS.ApiGatewayV2({ region });
  APIG.getRoutes;
  return APIG.getRoutes({ ApiId: apiId })
    .promise()
    .then(data => data.Items);
}

module.exports = {
  createApi: persistentRequest.bind(this, createApi),
  deleteApi: persistentRequest.bind(this, deleteApi),
  getRoutes: persistentRequest.bind(this, getRoutes),
  createStage: persistentRequest.bind(this, createStage),
  deleteStage: persistentRequest.bind(this, deleteStage),
};
