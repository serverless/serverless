'use strict';

const { awsRequest } = require('../misc');

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
