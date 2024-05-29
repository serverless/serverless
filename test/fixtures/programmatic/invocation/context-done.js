'use strict'

module.exports.handler = (event, context) => {
  if (event && event.shouldFail) {
    context.done(new Error('Failed on request'))
    return
  }
  context.done(null, {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Invoked',
      event,
      clientContext: context.clientContext,
      env: process.env,
    }),
  })
}
