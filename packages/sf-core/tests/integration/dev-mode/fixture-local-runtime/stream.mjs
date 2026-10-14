// `awslambda` is a global of Lambda's Node.js runtime, which Dev Mode provides on this machine too.
/* global awslambda */
export const handler = awslambda.streamifyResponse(
  async (event = {}, responseStream) => {
    if (event.capture) {
      responseStream.write(JSON.stringify({ environment: { ...process.env } }))
      responseStream.end()
      return
    }
    const stream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
    })
    for (const part of ['one', 'two', 'three']) {
      stream.write(`${part}\n`)
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    if (event.failMidStream) throw new Error('mid-stream')
    stream.end()
  },
)
