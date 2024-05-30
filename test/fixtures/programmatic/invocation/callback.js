'use strict'

module.exports.handler = (event, context, callback) => {
  if (event && event.shouldFail) {
    callback(new Error('Failed on request'))
    return
  }
  callback(null, {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Invoked',
      event,
      clientContext: context.clientContext,
      env: process.env,
    }),
  })
}
