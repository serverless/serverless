import { jest } from '@jest/globals'
import {
  runMicrovm,
  waitUntilRunning,
  createAuthToken,
  terminateMicrovm,
  resolveSandboxOutputs,
} from '../../../../../../../lib/plugins/aws/sandboxes/runtime/dataplane.js'

// Fake v3 client: records command class names + returns queued responses.
function fakeClient(responsesByCommand) {
  return {
    sent: [],
    async send(cmd) {
      const name = cmd.constructor.name
      this.sent.push({ name, input: cmd.input })
      const r = responsesByCommand[name]
      if (typeof r === 'function') return r(cmd.input)
      return r
    },
  }
}

test('runMicrovm sends camelCase input and returns id/endpoint/state', async () => {
  const client = fakeClient({
    RunMicrovmCommand: {
      microvmId: 'mv-1',
      endpoint: 'host',
      state: 'PENDING',
    },
  })
  const out = await runMicrovm(client, {
    imageArn: 'arn:img',
    executionRoleArn: 'arn:role',
  })
  expect(out).toEqual({ microvmId: 'mv-1', endpoint: 'host', state: 'PENDING' })
  expect(client.sent[0].name).toBe('RunMicrovmCommand')
  expect(client.sent[0].input.imageIdentifier).toBe('arn:img')
  expect(client.sent[0].input.executionRoleArn).toBe('arn:role')
  expect(client.sent[0].input.egressNetworkConnectors).toBeUndefined()
  // One-shot idle policy: short idle, no suspend window, no auto-resume, so a
  // leaked MicroVM self-terminates instead of lingering.
  expect(client.sent[0].input.idlePolicy).toEqual({
    maxIdleDurationSeconds: 60,
    suspendedDurationSeconds: 0,
    autoResumeEnabled: false,
  })
})

test('runMicrovm passes egressNetworkConnectors when a connector ARN is given', async () => {
  const client = fakeClient({
    RunMicrovmCommand: { microvmId: 'mv-1', endpoint: 'h', state: 'PENDING' },
  })
  await runMicrovm(client, {
    imageArn: 'arn:img',
    executionRoleArn: 'arn:role',
    egressConnectorArn: 'arn:conn',
  })
  expect(client.sent[0].input.egressNetworkConnectors).toEqual(['arn:conn'])
})

test('waitUntilRunning polls GetMicrovm until RUNNING', async () => {
  let n = 0
  const client = fakeClient({
    GetMicrovmCommand: () => {
      n += 1
      return n < 2
        ? { state: 'PENDING', endpoint: 'h' }
        : { state: 'RUNNING', endpoint: 'h' }
    },
  })
  const out = await waitUntilRunning(client, 'mv-1', { sleep: async () => {} })
  expect(out.state).toBe('RUNNING')
  expect(n).toBe(2)
})

test('waitUntilRunning throws on terminal failure', async () => {
  const client = fakeClient({
    GetMicrovmCommand: { state: 'FAILED', stateReason: 'boom' },
  })
  await expect(
    waitUntilRunning(client, 'mv-1', { sleep: async () => {} }),
  ).rejects.toThrow(/boom|did not reach RUNNING/)
})

test('createAuthToken returns the X-aws-proxy-auth value with camelCase input', async () => {
  const client = fakeClient({
    CreateMicrovmAuthTokenCommand: {
      authToken: { 'X-aws-proxy-auth': 'JWE' },
    },
  })
  const tok = await createAuthToken(client, 'mv-1', 8080)
  expect(tok).toBe('JWE')
  const input = client.sent[0].input
  expect(input.microvmIdentifier).toBe('mv-1')
  expect(input.allowedPorts).toEqual([{ port: 8080 }])
  expect(input.expirationInMinutes).toBeGreaterThan(0)
})

test('terminateMicrovm swallows errors without a logger (best-effort cleanup)', async () => {
  const client = {
    async send() {
      throw new Error('nope')
    },
  }
  await expect(terminateMicrovm(client, 'mv-1')).resolves.toBeUndefined()
})

test('terminateMicrovm calls log.warn on failure when a logger is provided', async () => {
  const client = {
    async send() {
      throw new Error('AccessDenied')
    },
  }
  const log = { warn: jest.fn() }
  await expect(terminateMicrovm(client, 'mv-1', log)).resolves.toBeUndefined()
  expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('mv-1'))
  expect(log.warn.mock.calls[0][0]).toContain('billable')
})

test('resolveSandboxOutputs reads image/exec/connector outputs by logical id', async () => {
  const provider = {
    naming: { getStackName: () => 'svc-dev' },
    request: jest.fn().mockResolvedValue({
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'EchoImageArn', OutputValue: 'arn:img' },
            { OutputKey: 'EchoImageExecutionRoleArn', OutputValue: 'arn:role' },
            { OutputKey: 'EchoConnectorArn', OutputValue: 'arn:conn' },
          ],
        },
      ],
    }),
  }
  const out = await resolveSandboxOutputs(provider, 'echo')
  expect(out).toEqual({
    imageArn: 'arn:img',
    executionRoleArn: 'arn:role',
    connectorArn: 'arn:conn',
  })
})
