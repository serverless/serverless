'use strict'

module.exports.handler = (event, context) => {
  if (event && event.shouldFail) {
    context.fail(new Error('Failed on request'))
    return
  }
  context.succeed({
    statusCode: 200,
    body: JSON.stringify({
      message: 'Invoked',
      event,
      clientContext: context.clientContext,
      env: process.env,
    }),
  })
}
