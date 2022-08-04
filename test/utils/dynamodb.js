'use strict';

const awsRequest = require('@serverless/test/aws-request');
const DDBDocumentClient = require('aws-sdk').DynamoDB.DocumentClient;

async function putDynamoDbItem(tableName, item) {
  const params = {
    TableName: tableName,
    Item: item,
  };

  return awsRequest(DDBDocumentClient, 'put', params);
}

module.exports = {
  putDynamoDbItem,
};
