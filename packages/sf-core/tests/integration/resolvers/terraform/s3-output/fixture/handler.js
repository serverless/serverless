module.exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: 'Serverless Framework Test',
        input: event,
      },
      null,
      2,
    ),
  }
}
