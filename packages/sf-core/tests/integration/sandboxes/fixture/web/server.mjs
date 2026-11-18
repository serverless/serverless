import http from 'node:http'

http
  .createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({ app: 'site', FROM_PROVIDER: process.env.FROM_PROVIDER }),
    )
  })
  .listen(process.env.PORT ?? 3000)
