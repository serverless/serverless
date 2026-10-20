import http from 'node:http'

// Answers every request with the app's name, the path it received and the
// public hostname CloudFront forwards.
export const serve = (app) =>
  http
    .createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          app,
          path: req.url,
          forwardedHost: req.headers['x-forwarded-host'] ?? null,
        }),
      )
    })
    .listen(process.env.PORT ?? 3000)
