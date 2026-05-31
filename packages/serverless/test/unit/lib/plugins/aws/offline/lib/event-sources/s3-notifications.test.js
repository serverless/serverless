import { jest } from '@jest/globals'
import { createS3Notifier } from '../../../../../../../../lib/plugins/aws/offline/lib/event-sources/s3-notifications.js'

const REGION = 'us-east-1'

/**
 * Stub logger that silently discards all messages.
 */
function makeLogger() {
  return {
    info: jest.fn(),
    notice: jest.fn(),
    debug: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  }
}

/**
 * Build a `getLambdaFunction` lookup backed by a per-key invoke spy, plus the
 * record of every invoke call across all functions.
 */
function makeLambdas() {
  const invokes = {}
  const calls = []
  function getLambdaFunction(functionKey) {
    if (!invokes[functionKey]) {
      invokes[functionKey] = jest.fn((event) => {
        calls.push({ functionKey, event })
        return Promise.resolve()
      })
    }
    return { invoke: invokes[functionKey] }
  }
  return { getLambdaFunction, invokes, calls }
}

/**
 * A store-shaped mutation event.
 */
function mutation(overrides = {}) {
  return {
    bucket: 'uploads',
    key: 'photos/cat.png',
    eventName: 'ObjectCreated:Put',
    size: 1234,
    etag: '"acbd18db4cc2f85cedef654fccc4a4d8"',
    sequencer: '0000000000000001',
    ...overrides,
  }
}

test('invokes the matching function with an aws:s3 event', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'onUpload',
        bucket: 'uploads',
        event: 's3:ObjectCreated:*',
        rules: [],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(mutation())

  expect(calls).toHaveLength(1)
  expect(calls[0].functionKey).toBe('onUpload')
  const record = calls[0].event.Records[0]
  expect(record.eventSource).toBe('aws:s3')
  expect(record.awsRegion).toBe(REGION)
  expect(record.eventName).toBe('ObjectCreated:Put')
})

test('event-type glob ObjectCreated:* matches Put / Copy / CompleteMultipartUpload', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'fn',
        bucket: 'uploads',
        event: 's3:ObjectCreated:*',
        rules: [],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(mutation({ eventName: 'ObjectCreated:Put' }))
  await notifier.notify(mutation({ eventName: 'ObjectCreated:Copy' }))
  await notifier.notify(
    mutation({ eventName: 'ObjectCreated:CompleteMultipartUpload' }),
  )

  expect(calls).toHaveLength(3)
})

test('event-type glob does not match a different category', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'fn',
        bucket: 'uploads',
        event: 's3:ObjectCreated:*',
        rules: [],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(mutation({ eventName: 'ObjectRemoved:Delete' }))

  expect(calls).toHaveLength(0)
})

test('ObjectRemoved:* matches a delete', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'fn',
        bucket: 'uploads',
        event: 's3:ObjectRemoved:*',
        rules: [],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(
    mutation({ eventName: 'ObjectRemoved:Delete', size: 0, etag: '' }),
  )

  expect(calls).toHaveLength(1)
})

test('an exact event name matches only that name', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'fn',
        bucket: 'uploads',
        event: 's3:ObjectCreated:Put',
        rules: [],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(mutation({ eventName: 'ObjectCreated:Put' }))
  await notifier.notify(mutation({ eventName: 'ObjectCreated:Copy' }))

  expect(calls).toHaveLength(1)
  expect(calls[0].event.Records[0].eventName).toBe('ObjectCreated:Put')
})

test('does not invoke when the bucket differs', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'fn',
        bucket: 'other-bucket',
        event: 's3:ObjectCreated:*',
        rules: [],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(mutation({ bucket: 'uploads' }))

  expect(calls).toHaveLength(0)
})

test('does not invoke when there is no matching config at all', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(mutation())

  expect(calls).toHaveLength(0)
})

test('prefix rule gates the key', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'fn',
        bucket: 'uploads',
        event: 's3:ObjectCreated:*',
        rules: [{ prefix: 'photos/' }],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(mutation({ key: 'photos/cat.png' }))
  await notifier.notify(mutation({ key: 'docs/readme.txt' }))

  expect(calls).toHaveLength(1)
  expect(calls[0].event.Records[0].s3.object.key).toBe('photos/cat.png')
})

test('suffix rule gates the key', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'fn',
        bucket: 'uploads',
        event: 's3:ObjectCreated:*',
        rules: [{ suffix: '.png' }],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(mutation({ key: 'photos/cat.png' }))
  await notifier.notify(mutation({ key: 'photos/cat.jpg' }))

  expect(calls).toHaveLength(1)
  expect(calls[0].event.Records[0].s3.object.key).toBe('photos/cat.png')
})

test('all rules must pass (prefix AND suffix)', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'fn',
        bucket: 'uploads',
        event: 's3:ObjectCreated:*',
        rules: [{ prefix: 'photos/' }, { suffix: '.png' }],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(mutation({ key: 'photos/cat.png' })) // matches both
  await notifier.notify(mutation({ key: 'photos/cat.jpg' })) // wrong suffix
  await notifier.notify(mutation({ key: 'docs/cat.png' })) // wrong prefix

  expect(calls).toHaveLength(1)
})

test('event JSON carries the url-encoded key (spaces as +) and unquoted eTag', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'fn',
        bucket: 'uploads',
        event: 's3:ObjectCreated:*',
        rules: [],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(
    mutation({
      key: 'my photos/a b.png',
      etag: '"acbd18db4cc2f85cedef654fccc4a4d8"',
      size: 99,
      sequencer: '00000000000000AB',
    }),
  )

  const record = calls[0].event.Records[0]
  expect(record.eventVersion).toBe('2.1')
  expect(record.s3.s3SchemaVersion).toBe('1.0')
  expect(record.s3.configurationId).toBe('fn')
  expect(record.s3.bucket.name).toBe('uploads')
  expect(record.s3.bucket.arn).toBe('arn:aws:s3:::uploads')
  expect(record.s3.bucket.ownerIdentity.principalId).toBe('AIDAOFFLINE')
  expect(record.userIdentity.principalId).toBe('AIDAOFFLINE')
  expect(record.requestParameters.sourceIPAddress).toBe('127.0.0.1')
  expect(record.responseElements['x-amz-request-id']).toBeDefined()
  expect(record.responseElements['x-amz-id-2']).toBeDefined()
  // Spaces encode as '+', the slash is preserved.
  expect(record.s3.object.key).toBe('my+photos/a+b.png')
  // eTag is stored quoted but the event carries it unquoted.
  expect(record.s3.object.eTag).toBe('acbd18db4cc2f85cedef654fccc4a4d8')
  expect(record.s3.object.size).toBe(99)
  expect(record.s3.object.sequencer).toBe('00000000000000AB')
})

test('fans out to every matching config', async () => {
  const { getLambdaFunction, calls } = makeLambdas()
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'a',
        bucket: 'uploads',
        event: 's3:ObjectCreated:*',
        rules: [],
      },
      {
        functionKey: 'b',
        bucket: 'uploads',
        event: 's3:ObjectCreated:Put',
        rules: [],
      },
      {
        functionKey: 'c',
        bucket: 'other',
        event: 's3:ObjectCreated:*',
        rules: [],
      },
    ],
    getLambdaFunction,
    logger: makeLogger(),
    region: REGION,
  })

  await notifier.notify(
    mutation({ bucket: 'uploads', eventName: 'ObjectCreated:Put' }),
  )

  const keys = calls.map((c) => c.functionKey).sort()
  expect(keys).toEqual(['a', 'b'])
})

test('a rejected invoke is logged and does not throw', async () => {
  const logger = makeLogger()
  const boom = new Error('handler blew up')
  const getLambdaFunction = () => ({
    invoke: () => Promise.reject(boom),
  })
  const notifier = createS3Notifier({
    configs: [
      {
        functionKey: 'fn',
        bucket: 'uploads',
        event: 's3:ObjectCreated:*',
        rules: [],
      },
    ],
    getLambdaFunction,
    logger,
    region: REGION,
  })

  // notify is synchronous and fire-and-forget: it must not throw.
  expect(() => notifier.notify(mutation())).not.toThrow()
  // Allow the fire-and-forget rejection handler to settle.
  await new Promise((resolve) => setImmediate(resolve))
  expect(logger.error).toHaveBeenCalled()
})
