const tableName = process.env.SAMPLE_TABLE
const dynamodb = require('aws-sdk/clients/dynamodb')
const docClient = new dynamodb.DocumentClient()

exports.getAllItemsHandler = async (event) => {
  var params = {
    TableName: tableName,
  }
  const data = await docClient.scan(params).promise()
  return data.Items
}
