import path from 'path'
import url from 'url'
import { spawn, execFileSync } from 'child_process'
import { jest } from '@jest/globals'
import { DockerClient } from '@serverless/util/src/docker/index.js'
import { startControlPlane } from '@serverless/framework/lib/plugins/aws/sandboxes/dev/api-emulator/control-plane.js'
import { EmulatorRegistry } from '@serverless/framework/lib/plugins/aws/sandboxes/dev/api-emulator/registry.js'
import { ContainerManager } from '@serverless/framework/lib/plugins/aws/sandboxes/dev/api-emulator/container-manager.js'
import { createHookFirer } from '@serverless/framework/lib/plugins/aws/sandboxes/dev/api-emulator/hooks.js'
import {
  LambdaMicrovmsClient,
  RunMicrovmCommand,
  SuspendMicrovmCommand,
  ResumeMicrovmCommand,
  TerminateMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms'

// This is the dev-mode counterpart to dev-api-emulation.test.js. Where that test exercises the
// data-plane (SDK -> control-plane -> per-instance proxy -> app on :8080), this one exercises the
// LIFECYCLE-HOOK delivery path that makes `serverless dev --sandbox` useful for hook-driven workers:
// the emulator must POST ready/run/suspend/resume/terminate to the container's hook server on :9000,
// and the run hook must carry the runHookPayload. It is the regression guard for the readiness race
// where hooks were fired before the container bound :9000 and the run-hook dispatch was lost.
//
// Signal is creds-free: the echo fixture's hooks server logs `HOOK <name> ... body=<...>` for every
// hook, so we assert delivery by reading the container's own logs — no AWS credentials, no Anthropic
// session, no SecretsManager.

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const IMAGE = 'serverless-sandbox-dev-test/echo:latest'
const SERVICE = 'devhooks'
const SANDBOX = 'echo'
const CONTAINER_PREFIX = `sls-sandbox-dev-${SERVICE}-${SANDBOX}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Stream a container's logs (past + following) into an accumulating buffer. Following is required
// because the terminate hook fires immediately before the container is removed — a one-shot
// `docker logs` read after TerminateMicrovm returns would find the container already gone.
function followLogs(containerName) {
  let buf = ''
  const proc = spawn('docker', ['logs', '-f', containerName])
  proc.stdout.on('data', (d) => (buf += d.toString()))
  proc.stderr.on('data', (d) => (buf += d.toString()))
  return { getBuf: () => buf, stop: () => proc.kill() }
}

async function waitForLog(getBuf, substr, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (getBuf().includes(substr)) return
    await sleep(200)
  }
  throw new Error(
    `timed out waiting for ${JSON.stringify(substr)} in container logs; got:\n${getBuf()}`,
  )
}

function findContainerName() {
  const out = execFileSync('docker', [
    'ps',
    '-a',
    '--filter',
    `name=${CONTAINER_PREFIX}`,
    '--format',
    '{{.Names}}',
  ])
    .toString()
    .trim()
  return out.split('\n').filter(Boolean)[0]
}

function forceRemoveByPrefix() {
  const names = execFileSync('docker', [
    'ps',
    '-a',
    '--filter',
    `name=${CONTAINER_PREFIX}`,
    '--format',
    '{{.Names}}',
  ])
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)
  for (const n of names) {
    try {
      execFileSync('docker', ['rm', '-f', n])
    } catch {
      /* ignore */
    }
  }
}

// These tests build and run real Docker containers via `docker build --load`
// (a buildx/BuildKit flag). Skip cleanly where that build can't run rather than
// hard-failing:
//   - a runner with no Docker daemon (arm-linux release runner) → `docker`
//     throws `ENOENT`;
//   - a runner whose `docker build` is the classic builder (Windows runner) →
//     rejects `--load` with "unknown flag: --load".
// Probe the exact capability the build needs (does `docker build` accept
// `--load`) so the suite still runs wherever buildx-backed builds work (ubuntu
// CI, macOS Docker Desktop). No implementation change.
function dockerBuildSupportsLoad() {
  try {
    const help = execFileSync('docker', ['build', '--help'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString()
    return help.includes('--load')
  } catch {
    return false
  }
}
const d = dockerBuildSupportsLoad() ? describe : describe.skip

d('dev mode — lifecycle hook delivery to a real container', () => {
  jest.setTimeout(180000)
  const docker = new DockerClient()
  let cp, client, logs

  beforeAll(async () => {
    await docker.ensureIsRunning()
    forceRemoveByPrefix() // clear any container left by a previous interrupted run
    await docker.buildImage({
      containerName: 'sls-sandbox-dev-test-echo',
      containerPath: path.join(__dirname, 'fixture', 'app'),
      imageUri: IMAGE,
      platform: process.arch === 'arm64' ? 'linux/arm64' : 'linux/amd64',
    })
    const registry = new EmulatorRegistry({
      sandboxName: SANDBOX,
      minimumMemoryInMiB: 2048,
      imageArn: 'arn:local:echo',
    })
    const containerManager = new ContainerManager({
      docker,
      imageUri: IMAGE,
      serviceName: SERVICE,
      sandboxName: SANDBOX,
    })
    // Wire fireHook exactly as dev/index.js does: all runtime hooks enabled (+ ready).
    const fireHook = createHookFirer({
      enabledHooks: new Set(['ready', 'run', 'suspend', 'resume', 'terminate']),
    })
    cp = await startControlPlane({ registry, containerManager, fireHook })
    client = new LambdaMicrovmsClient({
      region: 'us-east-1',
      endpoint: cp.url,
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    })
  })

  afterAll(async () => {
    if (logs) logs.stop()
    if (cp) await cp.shutdown()
    forceRemoveByPrefix()
  })

  test('ready+run (with payload) on run; suspend/resume/terminate on the ops', async () => {
    const PAYLOAD = JSON.stringify({ session: { id: 'sesn-devmode-probe' } })

    // RunMicrovm awaits the readiness probe then awaits fireHook('ready') and fireHook('run'),
    // so by the time this resolves both hooks have been POSTed to the container's :9000.
    const run = await client.send(
      new RunMicrovmCommand({
        imageIdentifier: 'arn:local:echo',
        runHookPayload: PAYLOAD,
      }),
    )
    expect(run.microvmId).toBeTruthy()

    const containerName = findContainerName()
    expect(containerName).toBeTruthy()
    logs = followLogs(containerName)

    // Readiness fix: the run hook reaches the (now-listening) :9000 ...
    await waitForLog(logs.getBuf, 'HOOK ready')
    await waitForLog(logs.getBuf, 'HOOK run')
    // ... and carries the runHookPayload verbatim (the session dispatch the worker needs).
    await waitForLog(logs.getBuf, 'sesn-devmode-probe')

    await client.send(
      new SuspendMicrovmCommand({ microvmIdentifier: run.microvmId }),
    )
    await waitForLog(logs.getBuf, 'HOOK suspend')

    await client.send(
      new ResumeMicrovmCommand({ microvmIdentifier: run.microvmId }),
    )
    await waitForLog(logs.getBuf, 'HOOK resume')

    // terminate fires the hook, then removes the container — the follow stream captures it first.
    await client.send(
      new TerminateMicrovmCommand({ microvmIdentifier: run.microvmId }),
    )
    await waitForLog(logs.getBuf, 'HOOK terminate')
  })
})
