'use strict'

const streamifyResponse = awslambda.streamifyResponse

module.exports.handler = streamifyResponse(async (event, responseStream) => {
  responseStream.write('Hello')
  responseStream.end()
})
