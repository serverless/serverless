const dynamodb = require('aws-sdk/clients/dynamodb')
const docClient = new dynamodb.DocumentClient()
const tableName = process.env.SAMPLE_TABLE

exports.putItemHandler = async (event) => {
  const body = JSON.parse(event.body)
  const id = body.id
  const name = body.name

  var params = {
    TableName: tableName,
    Item: { id: id, name: name },
  }

  const result = await docClient.put(params).promise()
  return body
}
