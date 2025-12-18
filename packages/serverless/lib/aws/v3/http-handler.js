import { HttpsProxyAgent } from 'https-proxy-agent'
import https from 'https'
import fs from 'fs'
import { NodeHttpHandler } from '@smithy/node-http-handler'

const createV3RequestHandler = () => {
  const proxyUrl =
    process.env.proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy

  const ca = process.env.ca || process.env.HTTPS_CA || process.env.https_ca
  let caCerts = []
  if (ca) {
    const caArr = ca.split(',')
    caCerts = caCerts.concat(caArr.map((cert) => cert.replace(/\\n/g, '\n')))
  }
  const cafile =
    process.env.cafile || process.env.HTTPS_CAFILE || process.env.https_cafile
  if (cafile) {
    const caPathArr = cafile.split(',')
    caCerts = caCerts.concat(
      caPathArr.map((cafilePath) => fs.readFileSync(cafilePath.trim())),
    )
  }

  const tlsOptions = {}
  if (caCerts.length > 0)
    Object.assign(tlsOptions, { rejectUnauthorized: true, ca: caCerts })

  const agent = proxyUrl
    ? new HttpsProxyAgent(proxyUrl, tlsOptions)
    : tlsOptions.ca
      ? new https.Agent(tlsOptions)
      : undefined

  const timeoutMs = (() => {
    const t = process.env.AWS_CLIENT_TIMEOUT || process.env.aws_client_timeout
    return t ? parseInt(t, 10) : undefined
  })()

  return new NodeHttpHandler({
    ...(agent ? { httpAgent: agent, httpsAgent: agent } : {}),
    ...(timeoutMs
      ? { socketTimeout: timeoutMs, connectionTimeout: timeoutMs }
      : {}),
  })
}

export default createV3RequestHandler
