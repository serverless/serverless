'use strict'

module.exports.handler = (event, context, callback) => {
  process.nextTick(() =>
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        mode: 'callback',
      }),
    }),
  )
  return new Promise((resolve) =>
    setTimeout(() =>
      resolve({
        statusCode: 200,
        body: JSON.stringify({
          mode: 'promise',
        }),
      }),
    ),
  )
}
