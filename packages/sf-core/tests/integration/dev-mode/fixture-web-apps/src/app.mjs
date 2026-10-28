import { createHash } from 'node:crypto'
import http from 'node:http'
import { patternBytes } from './bytes.mjs'

const digest = (value) => createHash('sha256').update(value).digest('hex')
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The fixture's web server, as `app` answers: where it ran (Lambda or this machine), what the
 * request looked like when it got here, and the routes the suite needs for bodies and streams.
 * Header values that could be secrets are only ever returned as digests.
 */
export const startServer = (app) => {
  // Lambda tells a web function where to listen; Dev Mode leaves that variable out on this
  // machine.
  const ran = process.env.AWS_LAMBDA_HTTP_ENDPOINT ? 'deployed' : 'this-machine'
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname === '/whoami') {
        const authorization = req.headers.authorization
        return json(res, 200, {
          app,
          ran,
          method: req.method,
          path: url.pathname,
          host: req.headers.host,
          authorizationDigest: authorization ? digest(authorization) : null,
          forwarded: Object.fromEntries(
            Object.entries(req.headers).filter(([name]) =>
              name.startsWith('x-forwarded-'),
            ),
          ),
          devVariables: Object.keys(process.env).filter((name) =>
            name.startsWith('SLS_DEV_'),
          ),
        })
      }
      if (url.pathname === '/echo') {
        const body = await readBody(req)
        return json(res, 200, {
          app,
          ran,
          bytes: body.length,
          sha256: digest(body),
        })
      }
      if (url.pathname === '/bytes') {
        const body = patternBytes(Number(url.searchParams.get('size')))
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': body.length,
          'x-ran': ran,
        })
        return res.end(body)
      }
      if (url.pathname === '/events') {
        const count = Number(url.searchParams.get('count') ?? 10)
        const gapMs = Number(url.searchParams.get('gapMs') ?? 200)
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        })
        for (let i = 0; i < count; i += 1) {
          res.write(`id: ${i}\ndata: ${i} ${ran}\n\n`)
          await sleep(gapMs)
        }
        return res.end()
      }
      if (url.pathname === '/caller') {
        // Loaded on use: the Lambda Web Functions runtime has no AWS SDK, and the deployed code
        // never takes this route. On this machine it resolves from the repository.
        const { GetCallerIdentityCommand, STSClient } =
          await import('@aws-sdk/client-sts')
        const identity = await new STSClient({}).send(
          new GetCallerIdentityCommand({}),
        )
        return json(res, 200, { app, ran, callerArn: identity.Arn })
      }
      return json(res, 404, { app, ran, message: 'not found' })
    } catch (error) {
      return json(res, 500, { app, ran, error: error.name })
    }
  })
  server.listen(Number(process.env.PORT ?? 3000), process.env.HOSTNAME)
  return server
}
