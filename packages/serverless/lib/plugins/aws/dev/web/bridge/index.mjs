// The server a web app's dev revision runs while a Dev Mode session is attached: no user code,
// only the bridge (./server.mjs), listening where AWS Lambda sends the web function's requests
// (AWS_LAMBDA_HTTP_ENDPOINT). Built into one file by scripts/build-dev-web-bridge.mjs; this file
// wires the real clients and starts the server, everything else is in the modules it imports.
import http from 'node:http'
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { withoutSecrets } from '../../relay/redact.js'
import { createBridge } from './server.mjs'

const log = (line) => console.log(`Dev Mode: ${line}`)
const env = process.env

// The execution role's credentials, read at each call: STS is the only AWS call made with them.
// Bounded, so a request never waits on STS longer than the bridge's own waits allow.
const sts = new STSClient({
  region: env.AWS_REGION,
  maxAttempts: 2,
  credentials: async () => ({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    sessionToken: env.AWS_SESSION_TOKEN,
  }),
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 2_000,
    requestTimeout: 3_000,
  }),
})

const assumeRole = async (params) => {
  const { Credentials } = await sts.send(new AssumeRoleCommand(params))
  return {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretAccessKey,
    sessionToken: Credentials.SessionToken,
    expiration: Credentials.Expiration,
  }
}

const bridge = createBridge({ env, assumeRole, log })
const { host, port } = bridge.config.listen
const server = http.createServer(bridge.handle)

// A failure the bridge did not handle is logged, never allowed to stop the server.
process.on('unhandledRejection', (error) =>
  log(`unexpected failure: ${withoutSecrets(error?.message ?? error)}`),
)

const stop = () => {
  bridge.close()
  server.close()
  server.closeIdleConnections()
  setTimeout(() => process.exit(0), 500).unref()
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)

server.listen(port, host, () => log(`web bridge listening on ${host}:${port}`))
