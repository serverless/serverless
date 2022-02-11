'use strict';

const awsRequest = require('@serverless/test/aws-request');
const ApiGatewayV2Service = require('aws-sdk').ApiGatewayV2;

function createApi(name) {
  return awsRequest(ApiGatewayV2Service, 'createApi', {
    Name: name,
    ProtocolType: 'WEBSOCKET',
    RouteSelectionExpression: '$request.body.action',
  });
}

function createStage(apiId, stageName) {
  const params = {
    ApiId: apiId,
    StageName: stageName,
  };
  return awsRequest(ApiGatewayV2Service, 'createStage', params);
}

function deleteApi(id) {
  return awsRequest(ApiGatewayV2Service, 'deleteApi', {
    ApiId: id,
  });
}

function deleteStage(apiId, stageName) {
  const params = {
    ApiId: apiId,
    StageName: stageName,
  };
  return awsRequest(ApiGatewayV2Service, 'deleteStage', params);
}

function getRoutes(apiId) {
  return awsRequest(ApiGatewayV2Service, 'getRoutes', { ApiId: apiId }).then((data) => data.Items);
}

module.exports = {
  createApi,
  deleteApi,
  getRoutes,
  createStage,
  deleteStage,
};
