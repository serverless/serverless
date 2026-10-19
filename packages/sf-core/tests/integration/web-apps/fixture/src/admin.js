import http from 'node:http'

http
  .createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ app: 'admin', path: req.url }))
  })
  .listen(process.env.PORT ?? 3000)
