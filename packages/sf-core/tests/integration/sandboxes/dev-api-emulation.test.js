import path from 'path'
import url from 'url'
import { jest } from '@jest/globals'
import { DockerClient } from '@serverless/util/src/docker/index.js'
import { startControlPlane } from '@serverless/framework/lib/plugins/aws/sandboxes/dev/api-emulator/control-plane.js'
import { EmulatorRegistry } from '@serverless/framework/lib/plugins/aws/sandboxes/dev/api-emulator/registry.js'
import { ContainerManager } from '@serverless/framework/lib/plugins/aws/sandboxes/dev/api-emulator/container-manager.js'
import {
  LambdaMicrovmsClient,
  GetMicrovmImageCommand,
  RunMicrovmCommand,
  GetMicrovmCommand,
  CreateMicrovmAuthTokenCommand,
  TerminateMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const IMAGE = 'serverless-sandbox-dev-test/echo:latest'

describe('dev API emulation — real SDK against the local control-plane', () => {
  jest.setTimeout(180000)
  const docker = new DockerClient()
  let cp, client

  beforeAll(async () => {
    await docker.ensureIsRunning()
    await docker.buildImage({
      containerName: 'sls-sandbox-dev-test-echo',
      containerPath: path.join(__dirname, 'fixture', 'app'),
      imageUri: IMAGE,
      platform: process.arch === 'arm64' ? 'linux/arm64' : 'linux/amd64',
    })
    const registry = new EmulatorRegistry({
      sandboxName: 'echo',
      minimumMemoryInMiB: 2048,
      imageArn: 'arn:local:echo',
    })
    const containerManager = new ContainerManager({
      docker,
      imageUri: IMAGE,
      serviceName: 'test',
      sandboxName: 'echo',
    })
    cp = await startControlPlane({ registry, containerManager })
    client = new LambdaMicrovmsClient({
      region: 'us-east-1',
      endpoint: cp.url,
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    })
  })

  afterAll(async () => {
    if (cp) await cp.shutdown()
  })

  test('full lifecycle: image -> run -> running -> token -> request -> terminate', async () => {
    // 1. GetMicrovmImage returns CREATED
    const img = await client.send(
      new GetMicrovmImageCommand({ imageIdentifier: 'arn:local:echo' }),
    )
    expect(img.state).toBe('CREATED')

    // 2. RunMicrovm returns microvmId + endpoint
    const run = await client.send(
      new RunMicrovmCommand({ imageIdentifier: 'arn:local:echo' }),
    )
    expect(run.microvmId).toBeTruthy()
    expect(run.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    // 3. Poll GetMicrovm until RUNNING (container may need a moment)
    let state = run.state
    for (let i = 0; i < 30 && state !== 'RUNNING'; i++) {
      const g = await client.send(
        new GetMicrovmCommand({ microvmIdentifier: run.microvmId }),
      )
      state = g.state
      if (state === 'RUNNING') break
      await new Promise((r) => setTimeout(r, 200)) // pace the poll so a slow start doesn't exhaust 30 calls instantly
    }
    expect(state).toBe('RUNNING')

    // 4. CreateMicrovmAuthToken returns a token
    const tok = await client.send(
      new CreateMicrovmAuthTokenCommand({
        microvmIdentifier: run.microvmId,
        allowedPorts: [{ port: 8080 }],
        expirationInMinutes: 30,
      }),
    )
    const token = tok.authToken['X-aws-proxy-auth']
    expect(token).toBeTruthy()

    // 4b. Wait for container's app server to be ready (Python may take a moment to bind port 8080).
    //     Probe via the proxy with valid auth; retry while the proxy returns 502 (upstream not yet reachable).
    const deadline = Date.now() + 30000
    let ready = false
    while (Date.now() < deadline) {
      const probe = await fetch(`${run.endpoint}/_ready`, {
        headers: { 'X-aws-proxy-auth': token, 'X-aws-proxy-port': '8080' },
      })
      if (probe.status !== 502) {
        ready = true
        break
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    if (!ready)
      throw new Error(
        'container app server never became reachable (readiness probe timed out after 30s)',
      )

    // 5. Proxy request with valid token + port 8080 → 200, x-amzn-requestid present,
    //    x-aws-proxy-* headers stripped from echo body
    const ok = await fetch(`${run.endpoint}/hello`, {
      headers: { 'X-aws-proxy-auth': token, 'X-aws-proxy-port': '8080' },
    })
    expect(ok.status).toBe(200)
    expect(ok.headers.get('x-amzn-requestid')).toBeTruthy()
    const echoed = await ok.json()
    expect(
      Object.keys(echoed.headers).some((h) =>
        h.toLowerCase().startsWith('x-aws-proxy-'),
      ),
    ).toBe(false)

    // 6. Missing token → 403 "Request missing authentication"
    const bad = await fetch(`${run.endpoint}/hello`)
    expect(bad.status).toBe(403)
    expect(await bad.text()).toBe('Request missing authentication')

    // 7. Disallowed port (token only allowed 8080) → 403 "Access to port denied"
    const portDenied = await fetch(`${run.endpoint}/hello`, {
      headers: { 'X-aws-proxy-auth': token, 'X-aws-proxy-port': '9999' },
    })
    expect(portDenied.status).toBe(403)
    expect(await portDenied.text()).toBe('Access to port denied')

    // 8. TerminateMicrovm → GetMicrovm shows TERMINATED
    await client.send(
      new TerminateMicrovmCommand({ microvmIdentifier: run.microvmId }),
    )
    const after = await client.send(
      new GetMicrovmCommand({ microvmIdentifier: run.microvmId }),
    )
    expect(after.state).toBe('TERMINATED')
  })

  test('unknown microvm id -> ResourceNotFoundException (err.name fidelity)', async () => {
    await expect(
      client.send(
        new GetMicrovmCommand({ microvmIdentifier: 'microvm-does-not-exist' }),
      ),
    ).rejects.toMatchObject({ name: 'ResourceNotFoundException' })
  })
})
