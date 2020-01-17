'use strict';

const awsRequest = require('@serverless/test/aws-request');

function putDynamoDbItem(tableName, item) {
  const params = {
    TableName: tableName,
    Item: item,
  };

  return awsRequest('DynamoDB.DocumentClient', 'put', params);
}

module.exports = {
  putDynamoDbItem,
};
