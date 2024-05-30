'use strict'

module.exports.handler = async (event, context, callback) => {
  setTimeout(() =>
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        mode: 'callback',
      }),
    }),
  )
  return {
    statusCode: 200,
    body: JSON.stringify({
      mode: 'promise',
    }),
  }
}
