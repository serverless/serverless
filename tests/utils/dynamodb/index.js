'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function putDynamoDbItem(tableName, item) {
  const Ddb = new AWS.DynamoDB.DocumentClient({ region });

  const params = {
    TableName: tableName,
    Item: item,
  };

  return Ddb.put(params).promise();
}

module.exports = {
  putDynamoDbItem: persistentRequest.bind(this, putDynamoDbItem),
};
