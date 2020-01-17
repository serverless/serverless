'use strict';

const awsRequest = require('@serverless/test/aws-request');

function createApi(name) {
  return awsRequest('ApiGatewayV2', 'createApi', {
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
  return awsRequest('ApiGatewayV2', 'createStage', params);
}

function deleteApi(id) {
  return awsRequest('ApiGatewayV2', 'deleteApi', {
    ApiId: id,
  });
}

function deleteStage(apiId, stageName) {
  const params = {
    ApiId: apiId,
    StageName: stageName,
  };
  return awsRequest('ApiGatewayV2', 'deleteStage', params);
}

function getRoutes(apiId) {
  return awsRequest('ApiGatewayV2', 'getRoutes', { ApiId: apiId }).then(data => data.Items);
}

module.exports = {
  createApi,
  deleteApi,
  getRoutes,
  createStage,
  deleteStage,
};
