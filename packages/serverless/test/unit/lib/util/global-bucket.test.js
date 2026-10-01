// getOrCreateDefaultBucket bootstraps the account-wide deployment and state buckets: an SSM
// pointer names the bucket, and the first CLI process in a region claims the pointer with a
// create-only PutParameter. These tests drive the engine's SSM and S3 clients through mocks
// and record every AWS operation in one ordered log, so the regression guards can assert
// that paths which work today make exactly the same calls.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals'

const calls = []
const ssm = {
  getSsmParameter: jest.fn(),
  storeSSMParameter: jest.fn(),
}
// One behavior mock per AWS operation; the engine methods below log and delegate to them.
const s3 = {
  createBucket: jest.fn(),
  enableBucketVersioning: jest.fn(),
  fetchBucketVersioningStatus: jest.fn(),
}

jest.unstable_mockModule('@serverless/engine/src/lib/aws/ssm.js', () => ({
  AwsSsmClient: jest.fn(() => ({
    getSsmParameter: async (args) => {
      calls.push(['ssm.get', args.paramName])
      return ssm.getSsmParameter(args)
    },
    storeSSMParameter: async (args) => {
      calls.push(['ssm.put', args.paramName, JSON.parse(args.paramValue)])
      return ssm.storeSSMParameter(args)
    },
  })),
}))

jest.unstable_mockModule('@serverless/engine/src/lib/aws/s3.js', () => ({
  AwsS3Client: jest.fn((config) => {
    const createBucket = async (args) => {
      calls.push(['CreateBucket', args.bucketName, config.region])
      return s3.createBucket(args)
    }
    const enableBucketVersioning = async (args) => {
      calls.push(['PutBucketVersioning', args.bucketName, config.region])
      return s3.enableBucketVersioning(args)
    }
    return {
      createBucket,
      enableBucketVersioning,
      // Same two operations, in order, as the engine's combined helper
      createVersionedBucket: async (args) => {
        await createBucket(args)
        await enableBucketVersioning(args)
      },
      fetchBucketVersioningStatus: async (args) => {
        calls.push(['GetBucketVersioning', args.bucketName, config.region])
        return s3.fetchBucketVersioningStatus(args)
      },
    }
  }),
}))

const { getOrCreateDefaultBucket } =
  await import('@serverless/util/src/globalBucket/index.js')
const { ServerlessErrorCodes } = await import('@serverless/util')

const PARAM = '/serverless-framework/deployment/s3-bucket'
const OWN = 'serverless-framework-deployments-us-east-1-own000000'
const WINNER = 'serverless-framework-deployments-us-east-1-winner00000'
const CONFLICT_MESSAGE =
  'A conflicting conditional operation is currently in progress against this resource. Please try again.'

const awsError = (name, extra = {}) =>
  Object.assign(new Error(extra.message ?? name), { name, ...extra })
const pointer = (bucketName, bucketRegion = 'us-east-1') =>
  JSON.stringify({ bucketName, bucketRegion })
const logger = { debug: jest.fn() }
const operations = () => calls.map(([operation]) => operation)

const run = (overrides = {}) =>
  getOrCreateDefaultBucket({
    ssmParameterName: PARAM,
    s3BucketName: OWN,
    credentials: {},
    region: 'us-east-1',
    logger,
    ...overrides,
  })

// Drives fake timers until the promise settles; returns the settled outcome.
const settle = async (promise) => {
  let outcome
  promise.then(
    (value) => (outcome = { value }),
    (error) => (outcome = { error }),
  )
  for (let i = 0; i < 2000 && !outcome; i++) {
    await jest.advanceTimersByTimeAsync(100)
  }
  if (!outcome) throw new Error('promise did not settle')
  return outcome
}

// The pointer is missing on the first read and names `bucketName` on the re-read.
const loseTo = (bucketName = WINNER, bucketRegion = 'us-east-1') => {
  ssm.getSsmParameter
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(pointer(bucketName, bucketRegion))
  ssm.storeSSMParameter.mockRejectedValue(awsError('ParameterAlreadyExists'))
}

beforeEach(() => {
  jest.useFakeTimers()
  calls.length = 0
  jest.spyOn(Math, 'random').mockReturnValue(0.5)
  ssm.getSsmParameter.mockReset()
  ssm.storeSSMParameter.mockReset().mockResolvedValue({})
  s3.createBucket.mockReset().mockResolvedValue(undefined)
  s3.enableBucketVersioning.mockReset().mockResolvedValue(undefined)
  s3.fetchBucketVersioningStatus.mockReset().mockResolvedValue('Enabled')
  logger.debug.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('paths that work today (regression guards)', () => {
  test('pointer exists: same calls as today, no claim, no wait', async () => {
    ssm.getSsmParameter.mockResolvedValue(pointer(WINNER, 'eu-west-1'))
    s3.createBucket.mockRejectedValue(awsError('BucketAlreadyOwnedByYou'))

    const { value } = await settle(run())

    expect(value).toEqual({ bucketName: WINNER, bucketRegion: 'eu-west-1' })
    expect(calls).toEqual([
      ['ssm.get', PARAM],
      ['CreateBucket', WINNER, 'eu-west-1'],
    ])
  })

  test('pointer exists in us-east-1 (CreateBucket 200): versioning re-applied as today', async () => {
    ssm.getSsmParameter.mockResolvedValue(pointer(WINNER))

    await settle(run())

    expect(calls).toEqual([
      ['ssm.get', PARAM],
      ['CreateBucket', WINNER, 'us-east-1'],
      ['PutBucketVersioning', WINNER, 'us-east-1'],
    ])
  })

  test('first run without a race: claim, CreateBucket, PutBucketVersioning, no wait', async () => {
    ssm.getSsmParameter.mockResolvedValue(null)

    const { value } = await settle(run())

    expect(value).toEqual({ bucketName: OWN, bucketRegion: 'us-east-1' })
    expect(calls).toEqual([
      ['ssm.get', PARAM],
      ['ssm.put', PARAM, { bucketName: OWN, bucketRegion: 'us-east-1' }],
      ['CreateBucket', OWN, 'us-east-1'],
      ['PutBucketVersioning', OWN, 'us-east-1'],
    ])
  })

  test('claim leaves Overwrite and Type to the engine defaults (create-only String)', async () => {
    ssm.getSsmParameter.mockResolvedValue(null)

    await settle(run())

    expect(ssm.storeSSMParameter).toHaveBeenCalledTimes(1)
    expect(Object.keys(ssm.storeSSMParameter.mock.calls[0][0]).sort()).toEqual([
      'paramName',
      'paramValue',
    ])
  })

  test('access denied on the claim reaches the caller unchanged', async () => {
    ssm.getSsmParameter.mockResolvedValue(null)
    const denied = awsError('AccessDeniedException')
    ssm.storeSSMParameter.mockRejectedValue(denied)

    const { error } = await settle(run())

    expect(error).toBe(denied)
    expect(operations()).toEqual(['ssm.get', 'ssm.put'])
  })

  test('winner BucketAlreadyExists (another account owns the name) still fails', async () => {
    ssm.getSsmParameter.mockResolvedValue(null)
    const taken = awsError('BucketAlreadyExists')
    s3.createBucket.mockRejectedValue(taken)

    const { error } = await settle(run())

    expect(error).toBe(taken)
    expect(operations()).toEqual(['ssm.get', 'ssm.put', 'CreateBucket'])
  })

  test('winner PutBucketVersioning failure is thrown unchanged', async () => {
    ssm.getSsmParameter.mockResolvedValue(null)
    const denied = awsError('AccessDenied')
    s3.enableBucketVersioning.mockRejectedValue(denied)

    const { error } = await settle(run())

    expect(error).toBe(denied)
    expect(operations()).not.toContain('GetBucketVersioning')
  })
})

describe('losing the claim', () => {
  test.each([
    'ParameterAlreadyExists',
    'TooManyUpdates',
    'ThrottlingException',
  ])(
    '%s: re-reads, waits for the winner in its region, never touches the bucket',
    async (errorName) => {
      ssm.getSsmParameter
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(pointer(WINNER, 'eu-west-1'))
      ssm.storeSSMParameter.mockRejectedValue(awsError(errorName))

      const { value } = await settle(run())

      expect(value).toEqual({ bucketName: WINNER, bucketRegion: 'eu-west-1' })
      expect(calls).toEqual([
        ['ssm.get', PARAM],
        ['ssm.put', PARAM, { bucketName: OWN, bucketRegion: 'us-east-1' }],
        ['ssm.get', PARAM],
        ['GetBucketVersioning', WINNER, 'eu-west-1'],
      ])
    },
  )

  test('claim error recognised by originalName as well', async () => {
    ssm.getSsmParameter
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pointer(WINNER))
    ssm.storeSSMParameter.mockRejectedValue(
      Object.assign(new Error('wrapped'), {
        originalName: 'ParameterAlreadyExists',
      }),
    )

    const { value } = await settle(run())

    expect(value).toEqual({ bucketName: WINNER, bucketRegion: 'us-east-1' })
  })

  test("waits until the winner's bucket exists and has versioning enabled", async () => {
    loseTo()
    s3.fetchBucketVersioningStatus
      .mockRejectedValueOnce(awsError('NoSuchBucket'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('Suspended')
      .mockResolvedValueOnce('Enabled')

    const { value } = await settle(run())

    expect(value).toEqual({ bucketName: WINNER, bucketRegion: 'us-east-1' })
    expect(s3.fetchBucketVersioningStatus).toHaveBeenCalledTimes(4)
    expect(operations()).not.toContain('CreateBucket')
    expect(operations()).not.toContain('PutBucketVersioning')
  })

  test('re-read returns its own name (SDK retry after its write landed): it is the winner', async () => {
    loseTo(OWN)

    const { value } = await settle(run())

    expect(value).toEqual({ bucketName: OWN, bucketRegion: 'us-east-1' })
    expect(operations().slice(-2)).toEqual([
      'CreateBucket',
      'PutBucketVersioning',
    ])
  })

  test('nobody won: backs off, claims again, and creates its bucket', async () => {
    ssm.getSsmParameter.mockResolvedValue(null)
    ssm.storeSSMParameter
      .mockRejectedValueOnce(awsError('ThrottlingException'))
      .mockResolvedValueOnce({})
    Math.random.mockReturnValue(0)

    const promise = run()
    await jest.advanceTimersByTimeAsync(0)
    expect(ssm.storeSSMParameter).toHaveBeenCalledTimes(1)
    // first backoff: 0.25 s base with equal jitter, so 125 ms when random() is 0
    await jest.advanceTimersByTimeAsync(124)
    expect(ssm.storeSSMParameter).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1)
    expect(ssm.storeSSMParameter).toHaveBeenCalledTimes(2)

    const { value } = await settle(promise)
    expect(value).toEqual({ bucketName: OWN, bucketRegion: 'us-east-1' })
    expect(operations().slice(-2)).toEqual([
      'CreateBucket',
      'PutBucketVersioning',
    ])
  })

  test('claim backoff doubles each attempt', async () => {
    ssm.getSsmParameter.mockResolvedValue(null)
    Math.random.mockReturnValue(1)
    const putTimes = []
    const t0 = Date.now()
    ssm.storeSSMParameter.mockImplementation(async () => {
      putTimes.push(Date.now() - t0)
      throw awsError('TooManyUpdates')
    })

    await settle(run())

    // equal jitter with random() = 1 gives the full base: 250, 500, 1000, 2000 ms
    const gaps = putTimes.slice(1).map((t, i) => t - putTimes[i])
    expect(gaps).toEqual([250, 500, 1000, 2000])
  })

  test('gives up after 5 claim attempts with the last error, creating nothing', async () => {
    ssm.getSsmParameter.mockResolvedValue(null)
    const lastError = awsError('ThrottlingException', { message: 'last' })
    ssm.storeSSMParameter
      .mockRejectedValueOnce(awsError('TooManyUpdates'))
      .mockRejectedValueOnce(awsError('TooManyUpdates'))
      .mockRejectedValueOnce(awsError('TooManyUpdates'))
      .mockRejectedValueOnce(awsError('TooManyUpdates'))
      .mockRejectedValueOnce(lastError)

    const { error } = await settle(run())

    expect(error).toBe(lastError)
    expect(ssm.storeSSMParameter).toHaveBeenCalledTimes(5)
    expect(operations().filter((op) => !op.startsWith('ssm.'))).toEqual([])
  })

  test('a throttled re-read counts as "try again"', async () => {
    ssm.getSsmParameter
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(awsError('ThrottlingException'))
      .mockResolvedValueOnce(pointer(WINNER))
    ssm.storeSSMParameter.mockRejectedValue(awsError('ParameterAlreadyExists'))

    const { value } = await settle(run())

    expect(value).toEqual({ bucketName: WINNER, bucketRegion: 'us-east-1' })
    expect(ssm.storeSSMParameter).toHaveBeenCalledTimes(2)
  })

  test('any other re-read error is thrown at once, wrapped like the first read', async () => {
    ssm.getSsmParameter
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(awsError('AccessDeniedException'))
    ssm.storeSSMParameter.mockRejectedValue(awsError('ParameterAlreadyExists'))

    const { error } = await settle(run())

    expect(error.code).toBe(
      ServerlessErrorCodes.globalBucket.GLOBAL_BUCKET_GET_SSM_PARAMETER_FAILED,
    )
    expect(error.originalName).toBe('AccessDeniedException')
    expect(ssm.storeSSMParameter).toHaveBeenCalledTimes(1)
  })
})

describe('winner whose create or versioning call was contended', () => {
  test.each([
    ['BucketAlreadyOwnedByYou', awsError('BucketAlreadyOwnedByYou')],
    ['OperationAborted', awsError('OperationAborted')],
    [
      'the conflicting-operation message',
      awsError('Unknown', { message: CONFLICT_MESSAGE }),
    ],
  ])(
    'CreateBucket %s: waits for the bucket, enables versioning, waits until it is enabled',
    async (_, error) => {
      ssm.getSsmParameter.mockResolvedValue(null)
      s3.createBucket.mockRejectedValue(error)
      s3.fetchBucketVersioningStatus
        .mockRejectedValueOnce(awsError('NoSuchBucket'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce('Enabled')

      const { value } = await settle(run())

      expect(value).toEqual({ bucketName: OWN, bucketRegion: 'us-east-1' })
      expect(operations().slice(2)).toEqual([
        'CreateBucket',
        'GetBucketVersioning',
        'GetBucketVersioning',
        'PutBucketVersioning',
        'GetBucketVersioning',
      ])
    },
  )

  test.each([
    ['OperationAborted', awsError('OperationAborted')],
    [
      'the conflicting-operation message',
      awsError('Unknown', { message: CONFLICT_MESSAGE }),
    ],
  ])(
    'PutBucketVersioning %s (another request enabling it): waits until versioning is enabled',
    async (_, error) => {
      ssm.getSsmParameter.mockResolvedValue(null)
      s3.enableBucketVersioning.mockRejectedValue(error)
      s3.fetchBucketVersioningStatus
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce('Enabled')

      const { value } = await settle(run())

      expect(value).toEqual({ bucketName: OWN, bucketRegion: 'us-east-1' })
      expect(operations().slice(2)).toEqual([
        'CreateBucket',
        'PutBucketVersioning',
        'GetBucketVersioning',
        'GetBucketVersioning',
      ])
    },
  )

  test('a contended create and versioning share one 60 s limit', async () => {
    ssm.getSsmParameter.mockResolvedValue(null)
    s3.createBucket.mockRejectedValue(awsError('OperationAborted'))
    const t0 = Date.now()
    // bucket appears after 30 s but versioning never becomes enabled
    s3.fetchBucketVersioningStatus.mockImplementation(async () => {
      if (Date.now() - t0 < 30000) throw awsError('NoSuchBucket')
      return undefined
    })

    const { error } = await settle(run())

    expect(error.code).toBe(
      ServerlessErrorCodes.globalBucket.GLOBAL_BUCKET_NOT_AVAILABLE,
    )
    expect(Date.now() - t0).toBeLessThanOrEqual(60000)
  })

  test('a contended versioning call after a contended create keeps the same 60 s limit', async () => {
    ssm.getSsmParameter.mockResolvedValue(null)
    s3.createBucket.mockRejectedValue(awsError('OperationAborted'))
    s3.enableBucketVersioning.mockRejectedValue(awsError('OperationAborted'))
    const t0 = Date.now()
    // bucket appears after 30 s but versioning never becomes enabled
    s3.fetchBucketVersioningStatus.mockImplementation(async () => {
      if (Date.now() - t0 < 30000) throw awsError('NoSuchBucket')
      return undefined
    })

    const { error } = await settle(run())

    expect(error.code).toBe(
      ServerlessErrorCodes.globalBucket.GLOBAL_BUCKET_NOT_AVAILABLE,
    )
    expect(s3.enableBucketVersioning).toHaveBeenCalledTimes(1)
    expect(Date.now() - t0).toBeLessThanOrEqual(60000)
  })
})

describe('waiting for the bucket', () => {
  test('backs off 0.5 s, 1 s, 2 s, 4 s, then 5 s', async () => {
    loseTo()
    const times = []
    const t0 = Date.now()
    s3.fetchBucketVersioningStatus.mockImplementation(async () => {
      times.push(Date.now() - t0)
      if (times.length < 7) throw awsError('NoSuchBucket')
      return 'Enabled'
    })

    await settle(run())

    const gaps = times.slice(1).map((t, i) => t - times[i])
    expect(gaps).toEqual([500, 1000, 2000, 4000, 5000, 5000])
  })

  test.each([
    ['still missing', () => Promise.reject(awsError('NoSuchBucket'))],
    ['exists but never versioned', () => Promise.resolve(undefined)],
  ])(
    '%s after 60 s: GLOBAL_BUCKET_NOT_AVAILABLE, within the limit',
    async (_, behavior) => {
      loseTo()
      const t0 = Date.now()
      let lastCallAt
      s3.fetchBucketVersioningStatus.mockImplementation(async () => {
        lastCallAt = Date.now() - t0
        return behavior()
      })

      const { error } = await settle(run())

      expect(error.code).toBe(
        ServerlessErrorCodes.globalBucket.GLOBAL_BUCKET_NOT_AVAILABLE,
      )
      expect(error.message).toContain(WINNER)
      expect(error.message).toContain('Run the command again')
      expect(lastCallAt).toBeLessThanOrEqual(60000)
      expect(Date.now() - t0).toBeLessThanOrEqual(60000)
    },
  )

  test('AccessDenied: GLOBAL_BUCKET_ACCESS_DENIED after one call, not remapped by callers', async () => {
    loseTo()
    s3.fetchBucketVersioningStatus.mockRejectedValue(awsError('AccessDenied'))

    const { error } = await settle(run())

    expect(error.code).toBe(
      ServerlessErrorCodes.globalBucket.GLOBAL_BUCKET_ACCESS_DENIED,
    )
    expect(error.message).toContain(WINNER)
    expect(error.message).toContain('s3:GetBucketVersioning')
    // The callers turn errors named or originally named AccessDenied into their own
    // "storing the parameter" message; this error must pass through them as it is.
    const remapped = ['AccessDenied', 'AccessDeniedException']
    expect(remapped).not.toContain(error.name)
    expect(remapped).not.toContain(error.originalName)
    expect(s3.fetchBucketVersioningStatus).toHaveBeenCalledTimes(1)
  })

  test('any other error is rethrown as it is', async () => {
    loseTo()
    const other = awsError('Unknown', { $metadata: { httpStatusCode: 500 } })
    s3.fetchBucketVersioningStatus.mockRejectedValue(other)

    const { error } = await settle(run())

    expect(error).toBe(other)
    expect(s3.fetchBucketVersioningStatus).toHaveBeenCalledTimes(1)
  })

  test('uses a client for the stored bucket region, not the deploy region', async () => {
    loseTo(WINNER, 'ap-southeast-2')

    await settle(run({ region: 'us-east-1' }))

    expect(calls.at(-1)).toEqual([
      'GetBucketVersioning',
      WINNER,
      'ap-southeast-2',
    ])
  })
})
