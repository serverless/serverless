import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Fake SDK clients and command markers: each command records the input it was
// constructed with so the call shape can be asserted without a network.
const makeCommandClass = (name) => {
  const Ctor = function (input) {
    this.__command = name
    this.input = input
  }
  return Ctor
}

const secretsManagerSend = jest.fn()
const ssmSend = jest.fn()
const secretsManagerConfigs = []
const ssmConfigs = []

class FakeSecretsManagerClient {
  constructor(config) {
    secretsManagerConfigs.push(config)
  }

  send(command) {
    return secretsManagerSend(command)
  }
}

class FakeSSMClient {
  constructor(config) {
    ssmConfigs.push(config)
  }

  send(command) {
    return ssmSend(command)
  }
}

jest.unstable_mockModule('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: FakeSecretsManagerClient,
  GetSecretValueCommand: makeCommandClass('GetSecretValueCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-ssm', () => ({
  SSMClient: FakeSSMClient,
  GetParameterCommand: makeCommandClass('GetParameterCommand'),
}))

const { resolveStateKey } =
  await import('../../../../../../../lib/plugins/aws/mcp/entry/lib/state.mjs')

const secretArn =
  'arn:aws:secretsmanager:us-east-1:123456789012:secret:acme-dev-crm-AbCdEf'
const parameterArn =
  'arn:aws:ssm:us-east-1:123456789012:parameter/acme/dev/crm/state-key'

const accessDenied = (name) =>
  Object.assign(new Error(`User is not authorized to perform: ${name}`), {
    name: 'AccessDeniedException',
    $metadata: { httpStatusCode: 400 },
  })

describe('resolveStateKey', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    secretsManagerConfigs.length = 0
    ssmConfigs.length = 0
  })

  it('reads a Secrets Manager ARN through GetSecretValue', async () => {
    secretsManagerSend.mockResolvedValue({ SecretString: 'the-key' })
    expect(
      await resolveStateKey({ keyRef: secretArn, region: 'us-east-1' }),
    ).toBe('the-key')
    expect(secretsManagerConfigs).toEqual([{ region: 'us-east-1' }])
    const [command] = secretsManagerSend.mock.calls[0]
    expect(command.__command).toBe('GetSecretValueCommand')
    expect(command.input).toEqual({ SecretId: secretArn })
    expect(ssmSend).not.toHaveBeenCalled()
  })

  it('reads an SSM parameter ARN through GetParameter with decryption', async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: 'the-key' } })
    expect(
      await resolveStateKey({ keyRef: parameterArn, region: 'us-east-1' }),
    ).toBe('the-key')
    expect(ssmConfigs).toEqual([{ region: 'us-east-1' }])
    const [command] = ssmSend.mock.calls[0]
    expect(command.__command).toBe('GetParameterCommand')
    expect(command.input).toEqual({ Name: parameterArn, WithDecryption: true })
    expect(secretsManagerSend).not.toHaveBeenCalled()
  })

  // A bring-your-own key in another region passes deploy-time validation, and
  // the ARN names the region the key actually lives in - calling the function's
  // own regional endpoint for it would fail at cold start with ResourceNotFound.
  it('calls the Secrets Manager endpoint of the ARN region, not the function one', async () => {
    secretsManagerSend.mockResolvedValue({ SecretString: 'the-key' })
    await resolveStateKey({
      keyRef:
        'arn:aws:secretsmanager:eu-central-1:123456789012:secret:acme-dev-crm-AbCdEf',
      region: 'us-east-1',
    })
    expect(secretsManagerConfigs).toEqual([{ region: 'eu-central-1' }])
  })

  it('calls the SSM endpoint of the ARN region, not the function one', async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: 'the-key' } })
    await resolveStateKey({
      keyRef:
        'arn:aws:ssm:ap-southeast-2:123456789012:parameter/acme/dev/crm/state-key',
      region: 'us-east-1',
    })
    expect(ssmConfigs).toEqual([{ region: 'ap-southeast-2' }])
  })

  // Nothing the Framework writes lands here, but the environment is the user's
  // to set: a reference with no region segment falls back to the ambient one
  // rather than reaching for an endpoint with no region at all.
  it('falls back to the function region when the reference carries none', async () => {
    secretsManagerSend.mockResolvedValue({ SecretString: 'the-key' })
    await resolveStateKey({ keyRef: 'acme-dev-crm', region: 'eu-west-1' })
    expect(secretsManagerConfigs).toEqual([{ region: 'eu-west-1' }])
  })

  // The runtime layer of the two-layer BYO-role design: the Framework cannot
  // grant on a role it does not own, so the failure has to teach the fix.
  it('turns a Secrets Manager AccessDenied into a teaching error', async () => {
    secretsManagerSend.mockRejectedValue(
      accessDenied('secretsmanager:GetSecretValue'),
    )
    const error = await resolveStateKey({
      keyRef: secretArn,
      region: 'us-east-1',
    }).catch((e) => e)
    expect(error.message).toContain('secretsmanager:GetSecretValue')
    expect(error.message).toContain(secretArn)
    expect(error.message).toContain('execution role')
    expect(error.message).toContain('provider.iam.role.statements')
    expect(error.cause).toBeDefined()
  })

  // The API action is not always the missing grant: a CMK-encrypted secret or
  // SecureString denies with AccessDeniedException as well when the role may
  // call the API but not decrypt, so the AWS message has to be surfaced and
  // read rather than buried in `cause`.
  it('names kms:Decrypt when the denial mentions KMS', async () => {
    secretsManagerSend.mockRejectedValue(
      Object.assign(
        new Error(
          'Access to KMS is not allowed (Service: Kms, Status Code: 400)',
        ),
        { name: 'AccessDeniedException' },
      ),
    )
    const error = await resolveStateKey({
      keyRef: secretArn,
      region: 'us-east-1',
    }).catch((e) => e)
    expect(error.message).toContain('kms:Decrypt')
    expect(error.message).toContain('Access to KMS is not allowed')
    expect(error.message).toContain(secretArn)
    expect(error.cause).toBeDefined()
  })

  it('does not blame kms:Decrypt for a plain API denial', async () => {
    secretsManagerSend.mockRejectedValue(
      accessDenied('secretsmanager:GetSecretValue'),
    )
    const error = await resolveStateKey({
      keyRef: secretArn,
      region: 'us-east-1',
    }).catch((e) => e)
    expect(error.message).not.toContain('kms:Decrypt')
    // The AWS message itself, not just our summary of it.
    expect(error.message).toContain('User is not authorized to perform')
  })

  it('names ssm:GetParameter when the denied ARN is a parameter', async () => {
    ssmSend.mockRejectedValue(accessDenied('ssm:GetParameter'))
    const error = await resolveStateKey({
      keyRef: parameterArn,
      region: 'us-east-1',
    }).catch((e) => e)
    expect(error.message).toContain('ssm:GetParameter')
    expect(error.message).not.toContain('secretsmanager:GetSecretValue')
    expect(error.message).toContain(parameterArn)
  })

  // Some denials arrive as a bare 403 rather than a named AccessDenied error.
  it('treats a 403 response as a denial', async () => {
    secretsManagerSend.mockRejectedValue(
      Object.assign(new Error('Forbidden'), {
        name: 'ForbiddenException',
        $metadata: { httpStatusCode: 403 },
      }),
    )
    await expect(
      resolveStateKey({ keyRef: secretArn, region: 'us-east-1' }),
    ).rejects.toThrow(/provider\.iam\.role\.statements/)
  })

  it('propagates a non-denial failure unchanged', async () => {
    const original = Object.assign(
      new Error('Secrets Manager cannot find it'),
      {
        name: 'ResourceNotFoundException',
      },
    )
    secretsManagerSend.mockRejectedValue(original)
    await expect(
      resolveStateKey({ keyRef: secretArn, region: 'us-east-1' }),
    ).rejects.toBe(original)
  })

  it('rejects a reference that resolves to no string value', async () => {
    secretsManagerSend.mockResolvedValue({ SecretBinary: new Uint8Array([1]) })
    await expect(
      resolveStateKey({ keyRef: secretArn, region: 'us-east-1' }),
    ).rejects.toThrow(new RegExp(secretArn.replaceAll(':', '\\:')))
  })

  it('rejects a missing reference before calling AWS', async () => {
    await expect(
      resolveStateKey({ keyRef: '', region: 'us-east-1' }),
    ).rejects.toThrow(/SERVERLESS_MCP_STATE_KEY_REF/)
    expect(secretsManagerSend).not.toHaveBeenCalled()
    expect(ssmSend).not.toHaveBeenCalled()
  })
})
