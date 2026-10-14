// `awslambda` is a global of Lambda's Node.js runtime, which Dev Mode provides on this machine too.
/* global awslambda */
// Writes `chunks` lines, `gapMs` apart, each naming where it ran: "0 this-machine\n", ...
export const handler = awslambda.streamifyResponse(
  async (event = {}, responseStream) => {
    const ran =
      process.env.LAMBDA_TASK_ROOT === '/var/task' ? 'deployed' : 'this-machine'
    const chunks = Number(event.chunks ?? 3)
    const gapMs = Number(event.gapMs ?? 100)
    for (let i = 0; i < chunks; i += 1) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, gapMs))
      responseStream.write(`${i} ${ran}\n`)
    }
    responseStream.end()
  },
)
