'use strict'

import ServerlessError from '../../../../serverless-error.js'
import { getLogicalId } from '../utils/naming.js'

const TERMINAL_FAIL = new Set(['FAILED', 'TERMINATED', 'TERMINATING'])

export function makeClient(provider) {
  // Lazy import keeps the SDK out of the deploy hot path.
  return import('@aws-sdk/client-lambda-microvms').then(async (m) => {
    const region = provider.getRegion()
    const creds = await provider.getCredentials()
    return new m.LambdaMicrovmsClient({
      region,
      credentials: creds.credentials,
    })
  })
}

async function cmd(name) {
  const m = await import('@aws-sdk/client-lambda-microvms')
  return m[name]
}

export async function runMicrovm(
  client,
  { imageIdentifier, executionRoleArn, egressConnectorArn },
) {
  const RunMicrovmCommand = await cmd('RunMicrovmCommand')
  const input = {
    imageIdentifier,
    executionRoleArn,
    // `invoke` is one-shot: no suspend window, no auto-resume, short idle. So a
    // MicroVM we fail to terminate explicitly (e.g. the CLI is killed mid-call)
    // self-terminates ~60s after the request instead of lingering. Idle is
    // measured by endpoint traffic, and an in-flight request counts as activity,
    // so this never cuts off a legitimate invocation.
    idlePolicy: {
      maxIdleDurationSeconds: 60,
      suspendedDurationSeconds: 0,
      autoResumeEnabled: false,
    },
  }
  if (egressConnectorArn) input.egressNetworkConnectors = [egressConnectorArn]
  const r = await client.send(new RunMicrovmCommand(input))
  return { microvmId: r.microvmId, endpoint: r.endpoint, state: r.state }
}

export async function waitUntilRunning(
  client,
  microvmId,
  { intervalMs = 4000, timeoutMs = 300000, sleep = defaultSleep } = {},
) {
  const GetMicrovmCommand = await cmd('GetMicrovmCommand')
  const deadline = Date.now() + timeoutMs
  while (true) {
    const r = await client.send(
      new GetMicrovmCommand({ microvmIdentifier: microvmId }),
    )
    if (r.state === 'RUNNING') return { state: r.state, endpoint: r.endpoint }
    if (TERMINAL_FAIL.has(r.state)) {
      throw new ServerlessError(
        `MicroVM ${microvmId} entered ${r.state}${
          r.stateReason ? `: ${r.stateReason}` : ''
        }`,
        'SANDBOX_RUN_FAILED',
      )
    }
    if (Date.now() > deadline) {
      throw new ServerlessError(
        `MicroVM ${microvmId} did not reach RUNNING within ${timeoutMs}ms`,
        'SANDBOX_RUN_TIMEOUT',
      )
    }
    await sleep(intervalMs)
  }
}

export async function createAuthToken(client, microvmId, port) {
  const CreateMicrovmAuthTokenCommand = await cmd(
    'CreateMicrovmAuthTokenCommand',
  )
  const r = await client.send(
    new CreateMicrovmAuthTokenCommand({
      microvmIdentifier: microvmId,
      allowedPorts: [{ port }],
      expirationInMinutes: 30,
    }),
  )
  const token = r.authToken && r.authToken['X-aws-proxy-auth']
  if (!token) {
    throw new ServerlessError(
      'CreateMicrovmAuthToken did not return an X-aws-proxy-auth token',
      'SANDBOX_AUTH_TOKEN_MISSING',
    )
  }
  return token
}

export async function terminateMicrovm(client, microvmId, log) {
  try {
    const TerminateMicrovmCommand = await cmd('TerminateMicrovmCommand')
    await client.send(
      new TerminateMicrovmCommand({ microvmIdentifier: microvmId }),
    )
  } catch (err) {
    // Best-effort cleanup — never mask the original result.
    log?.warn?.(
      `Failed to terminate MicroVM ${microvmId}; it may still be running and billable: ${err.message}`,
    )
  }
}

export async function resolveSandboxOutputs(provider, sandboxName) {
  const stackName = provider.naming.getStackName()
  const result = await provider.request('CloudFormation', 'describeStacks', {
    StackName: stackName,
  })
  const stack = result.Stacks?.[0]
  if (!stack) {
    throw new ServerlessError(
      `Stack '${stackName}' not found. Deploy the service first.`,
      'SANDBOX_STACK_NOT_FOUND',
    )
  }
  const imageLogicalId = getLogicalId(sandboxName, 'Image')
  const connectorLogicalId = getLogicalId(sandboxName, 'Connector')
  const get = (key) =>
    stack.Outputs?.find((o) => o.OutputKey === key)?.OutputValue
  const imageIdentifier = get(`${imageLogicalId}Identifier`)
  const executionRoleArn = get(
    `${getLogicalId(sandboxName, 'ExecutionRole')}Arn`,
  )
  if (!imageIdentifier || !executionRoleArn) {
    throw new ServerlessError(
      `Sandbox '${sandboxName}' outputs not found in stack '${stackName}'. ` +
        `Make sure the sandbox is deployed.`,
      'SANDBOX_OUTPUTS_NOT_FOUND',
    )
  }
  return {
    imageIdentifier,
    executionRoleArn,
    connectorArn: get(`${connectorLogicalId}Arn`),
  }
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
