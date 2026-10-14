import {
  CONTROL_PLANE_PARALLELISM,
  attachFunction,
  checkAttachments,
  findAttachedFunctions,
  mapAttachRejection,
  restoreFunction,
  restoreFunctions,
} from '../../../../../../../lib/plugins/aws/dev/attach/attach.js'
import {
  buildAttachVariables,
  variablesOf,
  layerArnsOf,
} from '../../../../../../../lib/plugins/aws/dev/attach/undo-record.js'
import { fakeLambda, testSessionId } from './fakes.js'

let savedSuffix
beforeAll(() => {
  savedSuffix = process.env.SLS_DEV_TEST_SUFFIX
  delete process.env.SLS_DEV_TEST_SUFFIX
})
afterAll(() => {
  if (savedSuffix === undefined) delete process.env.SLS_DEV_TEST_SUFFIX
  else process.env.SLS_DEV_TEST_SUFFIX = savedSuffix
})

const DEV = 'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:1'
const USER_LAYER = 'arn:aws:lambda:us-east-1:123456789012:layer:deps:4'
const SDK_LAYER =
  'arn:aws:lambda:us-east-1:123456789012:layer:sls-sdk-node-v0-15-15:1'
const session = (id = testSessionId(1)) => ({
  id,
  owner: 'alice@mbp',
  attachedAt: 1790000000,
  broker: {
    arn: 'arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1',
    externalId: 'e'.repeat(32),
  },
})
const prepareFor = (s) => (live) =>
  live
    ? {
        variables: buildAttachVariables({
          live: variablesOf(live),
          otherLayerArns: layerArnsOf(live),
          session: s,
        }),
      }
    : {
        skip: {
          function: 'api',
          mode: 'skipped',
          reason: 'not_deployed',
          why: 'not deployed yet (run serverless deploy)',
          notes: [],
        },
      }
const quick = { sleep: async () => {} }
const named = (name, message = name) =>
  Object.assign(new Error(message), { name })
const updates = (lambda) =>
  lambda.calls
    .filter(([op]) => op === 'updateFunctionConfiguration')
    .map(([, p]) => p)

const lambdaWith = () =>
  fakeLambda({
    api: {
      Layers: [{ Arn: USER_LAYER }],
      Environment: { Variables: { TABLE: 'orders' } },
      Timeout: 6,
    },
  })

test('attach prepends the layer, sets the undo record, uses the RevisionId and never changes the timeout', async () => {
  const lambda = lambdaWith()
  expect(
    await attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(session()),
      ...quick,
    }),
  ).toEqual({
    status: 'attached',
    // The configuration the write was made against.
    live: expect.objectContaining({ FunctionName: 'api', RevisionId: 'r1' }),
  })
  const [params] = updates(lambda)
  expect(params.RevisionId).toBe('r1')
  expect(params.Layers).toEqual([DEV, USER_LAYER])
  expect(params).not.toHaveProperty('Timeout')
  expect(lambda.state.get('api').Environment.Variables).toMatchObject({
    TABLE: 'orders',
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
    SLS_DEV_SESSION: testSessionId(1),
  })
})

test('attach and restore change only layers and environment, in one call', async () => {
  const lambda = lambdaWith()
  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  await restoreFunction({ lambda, name: 'api', ...quick })
  const written = updates(lambda)
  expect(written).toHaveLength(2)
  for (const params of written) {
    expect(Object.keys(params).sort()).toEqual([
      'Environment',
      'FunctionName',
      'Layers',
      'RevisionId',
    ])
  }
})

test('a RevisionId race re-reads and re-derives, keeping the other change', async () => {
  const lambda = lambdaWith()
  lambda.beforeUpdate = () =>
    lambda.touch('api', (c) => ({
      Environment: {
        Variables: { ...c.Environment.Variables, ADDED: 'by a teammate' },
      },
    }))
  expect(
    (
      await attachFunction({
        lambda,
        name: 'api',
        layerArn: DEV,
        prepare: prepareFor(session()),
        ...quick,
      })
    ).status,
  ).toBe('attached')
  const [stale, fresh] = updates(lambda)
  expect(stale.RevisionId).toBe('r1')
  expect(fresh.RevisionId).toBe('r2')
  expect(updates(lambda)).toHaveLength(2)
  expect(lambda.state.get('api').Environment.Variables).toMatchObject({
    ADDED: 'by a teammate',
    SLS_DEV_SESSION: testSessionId(1),
  })
})

test('prepare sees the configuration read just before each write', async () => {
  const lambda = lambdaWith()
  lambda.beforeUpdate = () =>
    lambda.touch('api', (c) => ({
      Environment: { Variables: { ...c.Environment.Variables, ADDED: 'x' } },
    }))
  const seen = []
  const prepare = (live) => {
    seen.push(live.RevisionId)
    return prepareFor(session())(live)
  }
  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare,
    ...quick,
  })
  expect(seen).toEqual(['r1', 'r2'])
})

test('an update in progress elsewhere is waited out and retried', async () => {
  const lambda = lambdaWith()
  lambda.updateErrors.push(
    named('ResourceConflictException', 'An update is in progress for resource'),
  )
  const waits = []
  expect(
    (
      await attachFunction({
        lambda,
        name: 'api',
        layerArn: DEV,
        prepare: prepareFor(session()),
        sleep: async (ms) => {
          waits.push(ms)
        },
        random: () => 0.5,
      })
    ).status,
  ).toBe('attached')
  expect(waits).toEqual([375])
})

test('updates that stay in progress are reported as such, with jittered waits between tries', async () => {
  const lambda = lambdaWith()
  for (let i = 0; i < 4; i += 1) {
    lambda.updateErrors.push(
      named('ResourceConflictException', 'An update is in progress'),
    )
  }
  const waits = []
  const options = {
    sleep: async (ms) => {
      waits.push(ms)
    },
    random: () => 0.5,
  }
  expect(
    await attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(session()),
      ...options,
    }),
  ).toEqual({
    status: 'failed',
    message:
      'another update to it was still in progress while Dev Mode attached (tried 4 times)',
  })
  expect(waits).toEqual([375, 625, 1125])

  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  for (let i = 0; i < 4; i += 1) {
    lambda.updateErrors.push(
      named('ResourceConflictException', 'An update is in progress'),
    )
  }
  expect(await restoreFunction({ lambda, name: 'api', ...options })).toEqual({
    status: 'failed',
    message:
      'another update to it was still in progress while Dev Mode restored it (tried 4 times)',
  })
})

test('a function still being created is read again once it is active', async () => {
  const lambda = lambdaWith()
  lambda.touch('api', () => ({ State: 'Pending' }))
  let polls = 0
  const read = lambda.getFunction
  lambda.getFunction = async (name) => {
    polls += 1
    if (polls === 3) lambda.touch('api', () => ({ State: 'Active' }))
    return read(name)
  }
  expect(
    (
      await attachFunction({
        lambda,
        name: 'api',
        layerArn: DEV,
        prepare: prepareFor(session()),
        ...quick,
      })
    ).status,
  ).toBe('attached')
  expect(updates(lambda)[0].RevisionId).toBe('r3')
})

const UNREADABLE = {
  Error: {
    ErrorCode: 'KMSAccessDeniedException',
    Message: 'Lambda was unable to decrypt the environment variables',
  },
}

test.each([
  ['an environment error', UNREADABLE],
  ['an environment without variables', {}],
])(
  'attach never writes a function whose variables it cannot read (%s)',
  async (_label, Environment) => {
    const lambda = fakeLambda({ api: { Environment } })
    let prepared = 0
    const prepare = (live) => {
      prepared += 1
      return prepareFor(session())(live)
    }
    expect(
      await attachFunction({
        lambda,
        name: 'api',
        layerArn: DEV,
        prepare,
        ...quick,
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'env_unreadable',
      why: 'its environment variables are encrypted with a KMS key you cannot decrypt (needs kms:Decrypt)',
    })
    expect(prepared).toBe(0)
    expect(updates(lambda)).toHaveLength(0)
  },
)

test('restore never writes an attached function whose variables it cannot read', async () => {
  const lambda = fakeLambda({
    api: { Layers: [{ Arn: DEV }], Environment: UNREADABLE },
  })
  const outcome = await restoreFunction({ lambda, name: 'api', ...quick })
  expect(outcome.status).toBe('failed')
  expect(outcome.message).toContain('api')
  expect(outcome.message).toContain('kms:Decrypt')
  expect(updates(lambda)).toHaveLength(0)
})

test('restore leaves a function with unreadable variables and no Dev Mode layer unchanged, with a note', async () => {
  const lambda = fakeLambda({
    api: { Layers: [{ Arn: USER_LAYER }], Environment: UNREADABLE },
  })
  expect(
    await restoreFunction({ lambda, name: 'api', ...quick }),
  ).toMatchObject({
    status: 'unchanged',
    notes: [{ reason: 'env_unreadable' }],
  })
  expect(updates(lambda)).toHaveLength(0)
})

test('a function whose update is still in progress is read again once it settles', async () => {
  const lambda = lambdaWith()
  lambda.touch('api', () => ({ LastUpdateStatus: 'InProgress' }))
  let polls = 0
  const read = lambda.getFunction
  lambda.getFunction = async (name) => {
    polls += 1
    if (polls === 3) {
      lambda.touch('api', () => ({ LastUpdateStatus: 'Successful' }))
    }
    return read(name)
  }
  expect(
    (
      await attachFunction({
        lambda,
        name: 'api',
        layerArn: DEV,
        prepare: prepareFor(session()),
        ...quick,
      })
    ).status,
  ).toBe('attached')
  expect(updates(lambda)[0].RevisionId).toBe('r3')
})

test('gives up after repeated races instead of writing a stale configuration', async () => {
  const lambda = lambdaWith()
  for (let i = 0; i < 4; i += 1) {
    lambda.updateErrors.push(named('PreconditionFailedException'))
  }
  expect(
    await attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(session()),
      ...quick,
    }),
  ).toEqual({
    status: 'failed',
    message:
      'its configuration kept changing while Dev Mode attached (tried 4 times)',
  })
  expect(updates(lambda)).toHaveLength(4)
  expect(lambda.state.get('api').Environment.Variables).toEqual({
    TABLE: 'orders',
  })
})

test.each([
  [
    named(
      'InvalidParameterValueException',
      'Cannot reference more than 5 layers.',
    ),
    'no_free_layer_slot',
  ],
  [
    named(
      'InvalidParameterValueException',
      'Layers consume more than the available size of 262144000 bytes',
    ),
    'package_too_large',
  ],
  [
    named(
      'InvalidParameterValueException',
      'Function code combined with layers exceeds the maximum allowed size of 262144000 bytes. The actual size is 262144001 bytes.',
    ),
    'package_too_large',
  ],
  [
    named(
      'InvalidCodeSignatureException',
      'The code signature failed the integrity check.',
    ),
    'code_signing_enforced',
  ],
  [
    named(
      'InvalidParameterValueException',
      'exceeded the 4KB limit. Measured size: 4139 bytes',
    ),
    'env_too_large',
  ],
  [
    named(
      'CodeVerificationFailedException',
      'Lambda cannot deploy the function.',
    ),
    'code_signing_enforced',
  ],
])(
  'a rejected update is reported as deployed with reason %#',
  async (error, reason) => {
    expect(mapAttachRejection(error).reason).toBe(reason)
    const lambda = lambdaWith()
    lambda.updateErrors.push(error)
    expect(
      await attachFunction({
        lambda,
        name: 'api',
        layerArn: DEV,
        prepare: prepareFor(session()),
        ...quick,
      }),
    ).toMatchObject({ status: 'rejected', reason })
  },
)

test('an unrelated invalid parameter is not a rejection', () => {
  expect(
    mapAttachRejection(
      named('InvalidParameterValueException', 'The role is invalid'),
    ),
  ).toBeNull()
  expect(mapAttachRejection(undefined)).toBeNull()
})

test('an unknown update error is a failure with the AWS message', async () => {
  const lambda = lambdaWith()
  lambda.updateErrors.push(
    named(
      'KMSAccessDeniedException',
      'Lambda was unable to decrypt the environment variables',
    ),
  )
  expect(
    await attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(session()),
      ...quick,
    }),
  ).toEqual({
    status: 'failed',
    message: 'Lambda was unable to decrypt the environment variables',
  })
})

test('expired credentials stop the run with a credentials error', async () => {
  const lambda = lambdaWith()
  lambda.updateErrors.push(
    named('ExpiredTokenException', 'The security token included is expired'),
  )
  await expect(
    attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(session()),
      ...quick,
    }),
  ).rejects.toMatchObject({ code: 'DEV_MODE_AWS_CREDENTIALS_INVALID' })
  const restoring = lambdaWith()
  restoring.getFunction = async () => {
    throw named(
      'ExpiredTokenException',
      'The security token included is expired',
    )
  }
  await expect(
    restoreFunction({ lambda: restoring, name: 'api', ...quick }),
  ).rejects.toMatchObject({ code: 'DEV_MODE_AWS_CREDENTIALS_INVALID' })
})

test('a function that fails to apply the update is a failure', async () => {
  const lambda = lambdaWith()
  const read = lambda.getFunction
  let updated = false
  lambda.updateFunctionConfiguration = async () => {
    updated = true
  }
  lambda.getFunction = async (name) =>
    updated
      ? {
          ...(await read(name)),
          LastUpdateStatus: 'Failed',
          LastUpdateStatusReason: 'KMS key is disabled',
        }
      : read(name)
  expect(
    await attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(session()),
      ...quick,
    }),
  ).toEqual({ status: 'failed', message: 'KMS key is disabled' })
})

describe('the session key and the ExternalId never stay in a failure message', () => {
  // Never printed: assertions compare with includes(), so a failure shows no secret.
  const KEY = Buffer.alloc(32, 5).toString('base64')
  const EXTERNAL_ID = 'e'.repeat(32)
  const withKey = {
    ...session(),
    key: KEY,
    iotEndpoint: 'abcdefghijklmn-ats.iot.us-east-1.amazonaws.com',
  }
  // Lambda's 4 KB refusal echoes the whole environment; this wording is one no rule recognises.
  const echoing = (variables) =>
    named(
      'InvalidParameterValueException',
      `The environment was refused. Measured: ${JSON.stringify(variables)}`,
    )
  const leaks = (text) => text.includes(KEY) || text.includes(EXTERNAL_ID)
  const attached = async () => {
    const lambda = lambdaWith()
    await attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(withKey),
      ...quick,
    })
    return lambda
  }

  test('an attach error that echoes the environment', async () => {
    const lambda = lambdaWith()
    lambda.updateFunctionConfiguration = async (params) => {
      throw echoing(params.Environment.Variables)
    }
    const outcome = await attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(withKey),
      ...quick,
    })
    expect(outcome.status).toBe('failed')
    expect(leaks(outcome.message)).toBe(false)
    expect(outcome.message).toContain('"SLS_DEV_SESSION_KEY":"<redacted>"')
    expect(outcome.message).toContain(
      '"SLS_DEV_BROKER_EXTERNAL_ID":"<redacted>"',
    )
    expect(outcome.message).toContain('"TABLE":"orders"')
  })

  test('a failed update reason and a thrown error after the write', async () => {
    const lambda = lambdaWith()
    const read = lambda.getFunction
    let written
    lambda.updateFunctionConfiguration = async (params) => {
      written = params.Environment.Variables
    }
    lambda.getFunction = async (name) =>
      written
        ? {
            ...(await read(name)),
            LastUpdateStatus: 'Failed',
            LastUpdateStatusReason: `Rejected: ${JSON.stringify(written)}`,
          }
        : read(name)
    const outcome = await attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(withKey),
      ...quick,
    })
    expect(outcome.status).toBe('failed')
    expect(leaks(outcome.message)).toBe(false)

    written = undefined
    lambda.getFunction = async (name) => {
      if (written) throw named('ServiceException', JSON.stringify(written))
      return read(name)
    }
    const error = await attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(withKey),
      ...quick,
    }).catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(leaks(error.message)).toBe(false)
    expect(error.message).toContain('<redacted>')
  })

  test('a restore error that names the values the function carries', async () => {
    const lambda = await attached()
    lambda.updateFunctionConfiguration = async () => {
      throw echoing({ SLS_DEV_SESSION_KEY: KEY, OTHER: EXTERNAL_ID })
    }
    const outcome = await restoreFunction({ lambda, name: 'api', ...quick })
    expect(outcome.status).toBe('failed')
    expect(leaks(outcome.message)).toBe(false)
    const batch = await restoreFunctions({ lambda, names: ['api'], ...quick })
    expect(leaks(JSON.stringify(batch))).toBe(false)
  })
})

test('a function that vanished before the write is skipped', async () => {
  const lambda = fakeLambda({})
  expect(
    (
      await attachFunction({
        lambda,
        name: 'api',
        layerArn: DEV,
        prepare: prepareFor(session()),
        ...quick,
      })
    ).row,
  ).toMatchObject({ reason: 'not_deployed' })
  expect(updates(lambda)).toHaveLength(0)
})

test('attach then restore returns the function to its exact configuration', async () => {
  const lambda = lambdaWith()
  const before = JSON.stringify({
    L: lambda.state.get('api').Layers,
    E: lambda.state.get('api').Environment,
  })
  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  expect(
    await restoreFunction({
      lambda,
      name: 'api',
      onlySession: testSessionId(1),
      ...quick,
    }),
  ).toMatchObject({ status: 'restored', notes: [] })
  expect(
    JSON.stringify({
      L: lambda.state.get('api').Layers,
      E: lambda.state.get('api').Environment,
    }),
  ).toBe(before)
})

test('restore notes an original exec wrapper it could not put back', async () => {
  const lambda = fakeLambda({
    api: {
      Layers: [{ Arn: SDK_LAYER }],
      Environment: {
        Variables: {
          AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
        },
      },
    },
  })
  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  lambda.touch('api', (c) => ({
    Layers: c.Layers.filter((layer) => layer.Arn !== SDK_LAYER),
  }))
  const outcome = await restoreFunction({ lambda, name: 'api', ...quick })
  expect(outcome).toMatchObject({
    status: 'restored',
    notes: [{ reason: 'original_wrapper_dropped' }],
  })
  expect(outcome.notes[0].message).toContain(
    '/opt/sls-sdk-node/exec-wrapper.sh',
  )
  expect(lambda.state.get('api').Environment.Variables).toEqual({})
})

test('restore puts back an original exec wrapper while its layer is attached', async () => {
  const lambda = fakeLambda({
    api: {
      Layers: [{ Arn: SDK_LAYER }],
      Environment: {
        Variables: {
          AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
        },
      },
    },
  })
  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  expect(
    await restoreFunction({ lambda, name: 'api', ...quick }),
  ).toMatchObject({ status: 'restored', notes: [] })
  expect(lambda.state.get('api').Environment.Variables).toEqual({
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
  })
})

test('restore leaves a function another session took over', async () => {
  const lambda = lambdaWith()
  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare: prepareFor(session('s_bob')),
    ...quick,
  })
  expect(
    (
      await restoreFunction({
        lambda,
        name: 'api',
        onlySession: 's_mine',
        ...quick,
      })
    ).status,
  ).toBe('skipped')
  expect(lambda.state.get('api').Environment.Variables.SLS_DEV_SESSION).toBe(
    's_bob',
  )
})

test('restore without a session filter cleans any Dev Mode configuration, even a partial one', async () => {
  const lambda = fakeLambda({
    api: {
      Environment: {
        Variables: { AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper' },
      },
    },
  })
  expect(
    (await restoreFunction({ lambda, name: 'api', ...quick })).status,
  ).toBe('restored')
  expect(lambda.state.get('api').Environment.Variables).toEqual({})
})

test('restore deletes exactly the Dev Mode variables, not others sharing the prefix', async () => {
  const lambda = fakeLambda({
    api: {
      Environment: {
        Variables: { SLS_DEV_MODE_ORG_ID: 'org', SLS_DEV_TOKEN: 'token' },
      },
    },
  })
  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  await restoreFunction({ lambda, name: 'api', ...quick })
  expect(lambda.state.get('api').Environment.Variables).toEqual({
    SLS_DEV_MODE_ORG_ID: 'org',
    SLS_DEV_TOKEN: 'token',
  })
})

test("restore leaves a function's own SLS_DEV_SESSION alone", async () => {
  const lambda = fakeLambda({
    api: {
      Layers: [{ Arn: USER_LAYER }],
      Environment: { Variables: { SLS_DEV_SESSION: 'mine', TABLE: 'orders' } },
      Timeout: 6,
    },
  })
  expect(
    (await restoreFunction({ lambda, name: 'api', ...quick })).status,
  ).toBe('unchanged')
  expect(updates(lambda)).toEqual([])
  expect(lambda.state.get('api').Environment.Variables).toEqual({
    SLS_DEV_SESSION: 'mine',
    TABLE: 'orders',
  })
})

describe('a layer named like Dev Mode on a function Dev Mode did not attach', () => {
  // Someone else's layer with exactly Dev Mode's name, in the function's account and region.
  const sameName = (variables = { TABLE: 'orders' }) =>
    fakeLambda({
      api: {
        Layers: [{ Arn: DEV }, { Arn: USER_LAYER }],
        Environment: { Variables: variables },
        Timeout: 6,
      },
    })

  test('restore leaves the function untouched', async () => {
    const lambda = sameName()
    expect(
      (await restoreFunction({ lambda, name: 'api', ...quick })).status,
    ).toBe('unchanged')
    expect(updates(lambda)).toEqual([])
    expect(layerArnsOf(lambda.state.get('api'))).toEqual([DEV, USER_LAYER])
  })

  test('an incomplete undo record of its own does not count as an attachment either', async () => {
    const variables = { SLS_DEV_SESSION: 'mine', TABLE: 'orders' }
    const lambda = sameName(variables)
    expect(
      (await restoreFunction({ lambda, name: 'api', ...quick })).status,
    ).toBe('unchanged')
    expect(updates(lambda)).toEqual([])
    expect(lambda.state.get('api').Environment.Variables).toEqual(variables)
  })

  test('findAttachedFunctions does not list it', async () => {
    expect(
      await findAttachedFunctions({ lambda: sameName(), names: ['api'] }),
    ).toEqual([])
  })

  test('a function Dev Mode attached is still restored, its layer removed', async () => {
    const lambda = lambdaWith()
    await attachFunction({
      lambda,
      name: 'api',
      layerArn: DEV,
      prepare: prepareFor(session()),
      ...quick,
    })
    expect(
      await findAttachedFunctions({ lambda, names: ['api'] }),
    ).toHaveLength(1)
    expect(
      (await restoreFunction({ lambda, name: 'api', ...quick })).status,
    ).toBe('restored')
    expect(layerArnsOf(lambda.state.get('api'))).toEqual([USER_LAYER])
    expect(lambda.state.get('api').Environment.Variables).toEqual({
      TABLE: 'orders',
    })
  })
})

test('restore reports unchanged and missing functions', async () => {
  const lambda = lambdaWith()
  expect(
    (await restoreFunction({ lambda, name: 'api', ...quick })).status,
  ).toBe('unchanged')
  expect(
    (await restoreFunction({ lambda, name: 'gone', ...quick })).status,
  ).toBe('missing')
})

test('a restore race keeps the change made in between', async () => {
  const lambda = lambdaWith()
  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  lambda.beforeUpdate = () =>
    lambda.touch('api', (c) => ({
      Environment: { Variables: { ...c.Environment.Variables, LATE: 'yes' } },
    }))
  expect(
    (await restoreFunction({ lambda, name: 'api', ...quick })).status,
  ).toBe('restored')
  expect(lambda.state.get('api').Environment.Variables).toEqual({
    TABLE: 'orders',
    LATE: 'yes',
  })
})

test('restore gives up after repeated races instead of writing a stale configuration', async () => {
  const lambda = lambdaWith()
  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  for (let i = 0; i < 4; i += 1) {
    lambda.updateErrors.push(named('PreconditionFailedException'))
  }
  expect(await restoreFunction({ lambda, name: 'api', ...quick })).toEqual({
    status: 'failed',
    message:
      'its configuration kept changing while Dev Mode restored it (tried 4 times)',
  })
  expect(lambda.state.get('api').Environment.Variables.SLS_DEV_SESSION).toBe(
    testSessionId(1),
  )
})

test('restoreFunctions collects outcomes and reports progress', async () => {
  const lambda = fakeLambda({ a: {}, b: {}, c: {} })
  for (const name of ['a', 'b']) {
    await attachFunction({
      lambda,
      name,
      layerArn: DEV,
      prepare: prepareFor(session()),
      ...quick,
    })
  }
  lambda.updateErrors.push(named('ServiceException', 'boom'))
  const progress = []
  const result = await restoreFunctions({
    lambda,
    names: ['a', 'b', 'c', 'gone'],
    concurrency: 1,
    onProgress: (p) => progress.push(p.done),
    ...quick,
  })
  expect(result.failed.map((f) => f.name)).toEqual(['a'])
  expect(result.restored.map((f) => f.name)).toEqual(['b'])
  expect(result.unchanged.map((f) => f.name)).toEqual(['c'])
  expect(result.missing.map((f) => f.name)).toEqual(['gone'])
  expect(progress).toEqual([1, 2, 3, 4])
})

test('restoreFunctions never runs more than 10 functions at once', async () => {
  const names = Array.from({ length: 30 }, (_, i) => `f${i}`)
  const lambda = fakeLambda(Object.fromEntries(names.map((n) => [n, {}])))
  let active = 0
  let peak = 0
  const read = lambda.getFunction
  lambda.getFunction = async (name) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setImmediate(resolve))
    active -= 1
    return read(name)
  }
  const result = await restoreFunctions({
    lambda,
    names,
    concurrency: 50,
    ...quick,
  })
  expect(CONTROL_PLANE_PARALLELISM).toBe(10)
  expect(result.unchanged).toHaveLength(30)
  expect(peak).toBe(10)
})

test("findAttachedFunctions lists only this service's functions with Dev Mode configuration", async () => {
  const lambda = fakeLambda({
    'svc-dev-a': {},
    'svc-dev-b': {
      Environment: {
        Variables: { AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper' },
      },
    },
    'other-service-c': {
      Environment: {
        Variables: { SLS_DEV_SESSION: 's_x', SLS_DEV_OWNER: 'bob@desk' },
      },
    },
  })
  await attachFunction({
    lambda,
    name: 'svc-dev-a',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  expect(
    await findAttachedFunctions({ lambda, names: ['svc-dev-a', 'svc-dev-b'] }),
  ).toEqual([
    {
      name: 'svc-dev-a',
      attachment: {
        session: testSessionId(1),
        owner: 'alice@mbp',
        attachedAt: 1790000000,
      },
    },
    { name: 'svc-dev-b', attachment: null },
  ])
  const reads = lambda.calls.filter(([op]) => op === 'getFunction').slice(-2)
  expect(reads.map(([, name]) => name).sort()).toEqual([
    'svc-dev-a',
    'svc-dev-b',
  ])
})

test('a throwing progress callback never loses the batch result', async () => {
  const lambda = fakeLambda({ a: {}, b: {} })
  await attachFunction({
    lambda,
    name: 'a',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  const result = await restoreFunctions({
    lambda,
    names: ['a', 'b'],
    onProgress: () => {
      throw new Error('the terminal went away')
    },
    ...quick,
  })
  expect(result.restored.map((f) => f.name)).toEqual(['a'])
  expect(result.unchanged.map((f) => f.name)).toEqual(['b'])
  expect(lambda.state.get('a').Environment.Variables).toEqual({})
})

test('findAttachedFunctions flags a function with our layer whose variables it cannot read', async () => {
  const lambda = fakeLambda({
    api: { Layers: [{ Arn: DEV }], Environment: UNREADABLE },
    worker: { Layers: [{ Arn: USER_LAYER }], Environment: UNREADABLE },
  })
  expect(
    await findAttachedFunctions({ lambda, names: ['api', 'worker'] }),
  ).toEqual([{ name: 'api', attachment: null, unreadable: true }])
})

test('findAttachedFunctions refuses to run without the names of the functions to look at', async () => {
  const lambda = fakeLambda({
    'other-service-c': {
      Environment: { Variables: { SLS_DEV_SESSION: 's_x' } },
    },
  })
  for (const names of [undefined, null, 'other-service-c']) {
    await expect(findAttachedFunctions({ lambda, names })).rejects.toThrow(
      'findAttachedFunctions needs the names',
    )
  }
  expect(lambda.calls).toEqual([])
})

test('findAttachedFunctions reads only the requested functions; one not deployed is skipped quietly', async () => {
  const attached = {
    Layers: [{ Arn: DEV }],
    Environment: {
      Variables: { AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper' },
    },
  }
  const lambda = fakeLambda({
    a: attached,
    b: {},
    'other-service-c': attached,
  })
  expect(
    await findAttachedFunctions({
      lambda,
      names: ['a', 'b', 'never-deployed'],
    }),
  ).toEqual([{ name: 'a', attachment: null }])
  expect(lambda.calls.map(([op, name]) => `${op} ${name}`).sort()).toEqual([
    'getFunction a',
    'getFunction b',
    'getFunction never-deployed',
  ])
})

test('findAttachedFunctions reads at most 10 functions at once', async () => {
  const names = Array.from({ length: 25 }, (_, i) => `fn-${i}`)
  const lambda = fakeLambda(Object.fromEntries(names.map((n) => [n, {}])))
  const getFunction = lambda.getFunction
  let running = 0
  let peak = 0
  lambda.getFunction = async (name) => {
    running += 1
    peak = Math.max(peak, running)
    await new Promise((resolve) => setTimeout(resolve, 1))
    running -= 1
    return getFunction(name)
  }
  expect(await findAttachedFunctions({ lambda, names })).toEqual([])
  expect(peak).toBe(10)
})

test('one denied read fails the whole lookup with that denial, after every read settled', async () => {
  const lambda = fakeLambda({ a: { Layers: [{ Arn: DEV }] }, b: {}, c: {} })
  const getFunction = lambda.getFunction
  const settled = []
  lambda.getFunction = async (name) => {
    try {
      if (name === 'b') {
        throw Object.assign(
          new Error('not authorized to perform: lambda:GetFunction'),
          { name: 'AccessDeniedException' },
        )
      }
      return await getFunction(name)
    } finally {
      settled.push(name)
    }
  }
  await expect(
    findAttachedFunctions({ lambda, names: ['a', 'b', 'c'] }),
  ).rejects.toMatchObject({ name: 'AccessDeniedException' })
  expect(settled.sort()).toEqual(['a', 'b', 'c'])
})

test('a denial wins over another error, and expired credentials win over both', async () => {
  const lambda = fakeLambda({ a: {}, b: {}, c: {} })
  const errors = {
    a: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    b: Object.assign(new Error('denied'), { name: 'AccessDeniedException' }),
  }
  lambda.getFunction = async (name) => {
    if (errors[name]) throw errors[name]
    return null
  }
  await expect(
    findAttachedFunctions({ lambda, names: ['a', 'b', 'c'] }),
  ).rejects.toMatchObject({ name: 'AccessDeniedException' })
  errors.c = Object.assign(new Error('token expired'), {
    name: 'ExpiredTokenException',
  })
  await expect(
    findAttachedFunctions({ lambda, names: ['a', 'b', 'c'] }),
  ).rejects.toMatchObject({ code: 'DEV_MODE_AWS_CREDENTIALS_INVALID' })
})

test('checkAttachments tells how each attached function stands', async () => {
  const lambda = fakeLambda({ a: {}, b: {}, c: {}, d: {} })
  for (const name of ['a', 'b', 'c', 'd']) {
    await attachFunction({
      lambda,
      name,
      layerArn: DEV,
      prepare: prepareFor(session()),
      ...quick,
    })
  }
  lambda.touch('b', (c) => ({
    Environment: {
      Variables: {
        ...c.Environment.Variables,
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
      },
    },
  }))
  lambda.touch('c', () => ({ Environment: { Variables: {} } }))
  lambda.touch('d', (c) => ({
    Environment: {
      Variables: {
        ...c.Environment.Variables,
        SLS_DEV_SESSION: 's_bob',
        SLS_DEV_OWNER: 'bob@desk',
      },
    },
  }))
  expect(
    await checkAttachments({
      lambda,
      names: ['a', 'b', 'c', 'd', 'gone'],
      sessionId: testSessionId(1),
    }),
  ).toEqual([
    { name: 'a', state: 'attached', owner: 'alice@mbp' },
    { name: 'b', state: 'wrapper_replaced', owner: 'alice@mbp' },
    { name: 'c', state: 'detached' },
    { name: 'd', state: 'taken_over', owner: 'bob@desk' },
    { name: 'gone', state: 'function_deleted' },
  ])
  expect(updates(lambda)).toHaveLength(4)
})

test('checkAttachments reports variables it can no longer read, and never writes', async () => {
  const lambda = fakeLambda({
    api: { Layers: [{ Arn: DEV }], Environment: UNREADABLE },
    worker: { Layers: [{ Arn: USER_LAYER }], Environment: UNREADABLE },
  })
  expect(
    await checkAttachments({
      lambda,
      names: ['api', 'worker'],
      sessionId: testSessionId(1),
    }),
  ).toEqual([
    { name: 'api', state: 'env_unreadable' },
    { name: 'worker', state: 'detached' },
  ])
  expect(lambda.calls.map(([op]) => op)).toEqual(['getFunction', 'getFunction'])
})

test('checkAttachments reads with GetFunction only, at most 10 functions at once', async () => {
  const names = Array.from({ length: 25 }, (_, i) => `fn-${i}`)
  const lambda = fakeLambda(Object.fromEntries(names.map((n) => [n, {}])))
  const getFunction = lambda.getFunction
  let running = 0
  let peak = 0
  lambda.getFunction = async (name) => {
    running += 1
    peak = Math.max(peak, running)
    await new Promise((resolve) => setTimeout(resolve, 1))
    running -= 1
    return getFunction(name)
  }
  const states = await checkAttachments({ lambda, names, sessionId: 's_x' })
  expect(states.map((s) => s.name)).toEqual(names)
  expect(new Set(lambda.calls.map(([op]) => op))).toEqual(
    new Set(['getFunction']),
  )
  expect(peak).toBe(10)
})

test('a function that cannot be read is skipped; the others are still checked', async () => {
  const lambda = fakeLambda({ a: {}, b: {} })
  const throttled = Object.assign(new Error('Rate exceeded'), {
    name: 'TooManyRequestsException',
  })
  const getFunction = lambda.getFunction
  lambda.getFunction = async (name) => {
    if (name === 'a') throw throttled
    return getFunction(name)
  }
  expect(
    await checkAttachments({ lambda, names: ['a', 'b'], sessionId: 's_x' }),
  ).toEqual([
    { name: 'a', state: 'unchecked', error: throttled },
    { name: 'b', state: 'detached' },
  ])
})

test('checkAttachments fails only when no function could be read, expired credentials first', async () => {
  const lambda = fakeLambda({ a: {}, b: {} })
  const errors = {
    a: Object.assign(new Error('Rate exceeded'), {
      name: 'TooManyRequestsException',
    }),
    b: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
  }
  lambda.getFunction = async (name) => {
    throw errors[name]
  }
  await expect(
    checkAttachments({ lambda, names: ['a', 'b'], sessionId: 's_x' }),
  ).rejects.toMatchObject({ name: 'TooManyRequestsException' })
  errors.b = Object.assign(new Error('token expired'), {
    name: 'ExpiredTokenException',
  })
  await expect(
    checkAttachments({ lambda, names: ['a', 'b'], sessionId: 's_x' }),
  ).rejects.toMatchObject({ code: 'DEV_MODE_AWS_CREDENTIALS_INVALID' })
})

test('our wrapper without our layer is reported, and restore still cleans it up', async () => {
  const lambda = fakeLambda({ api: { Layers: [{ Arn: USER_LAYER }] } })
  await attachFunction({
    lambda,
    name: 'api',
    layerArn: DEV,
    prepare: prepareFor(session()),
    ...quick,
  })
  lambda.touch('api', () => ({ Layers: [{ Arn: USER_LAYER }] }))
  expect(
    await checkAttachments({
      lambda,
      names: ['api'],
      sessionId: testSessionId(1),
    }),
  ).toEqual([{ name: 'api', state: 'layer_missing' }])
  expect(
    await restoreFunction({
      lambda,
      name: 'api',
      onlySession: testSessionId(1),
      ...quick,
    }),
  ).toMatchObject({ status: 'restored' })
  expect(lambda.state.get('api').Environment.Variables).toEqual({})
  expect(layerArnsOf(lambda.state.get('api'))).toEqual([USER_LAYER])
})
