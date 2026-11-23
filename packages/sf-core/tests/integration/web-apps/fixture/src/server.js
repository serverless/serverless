import express from 'express'
import { version } from './version.js'

const app = express()

app.get('/{*path}', (req, res) => {
  console.log(`api served ${req.path} (${version})`)
  res.json({
    app: 'api',
    version,
    path: req.path,
    endpoint: process.env.AWS_LAMBDA_HTTP_ENDPOINT,
    entrypoint: process.env.AWS_LAMBDA_NODEJS_ENTRYPOINT,
    hostname: process.env.HOSTNAME,
    port: process.env.PORT,
  })
})

app.listen(process.env.PORT ?? 3000)
