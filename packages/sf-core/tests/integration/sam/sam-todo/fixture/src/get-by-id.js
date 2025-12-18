const tableName = process.env.SAMPLE_TABLE
const dynamodb = require('aws-sdk/clients/dynamodb')
const docClient = new dynamodb.DocumentClient()

exports.getByIdHandler = async (event) => {
  const id = event.pathParameters.id

  var params = {
    TableName: tableName,
    Key: { id: id },
  }
  const data = await docClient.get(params).promise()
  return data.Item
}
