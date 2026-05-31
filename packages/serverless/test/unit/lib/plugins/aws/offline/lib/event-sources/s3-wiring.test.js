import { jest } from '@jest/globals'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createBucketStore } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/s3/bucket-store.js'
import {
  createRegistry,
  registerS3Bucket,
} from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'
import { wireS3 } from '../../../../../../../../lib/plugins/aws/offline/lib/event-sources/s3-wiring.js'

function makeLogger() {
  return {
    info: jest.fn(),
    notice: jest.fn(),
    debug: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  }
}

function makeServerless({ functions = {} } = {}) {
  return { service: { functions } }
}

function makeLambdas() {
  const calls = []
  const getLambdaFunction = (functionKey) => ({
    invoke: (event) => {
      calls.push({ functionKey, event })
      return Promise.resolve()
    },
  })
  return { getLambdaFunction, calls }
}

async function waitFor(predicate, { timeout = 5000, interval = 25 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    if (await predicate()) return
    if (Date.now() > deadline) {
      throw new Error('waitFor: condition not met before timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

let tmpRoots = []
let activeWatchers = []

async function makeBucketsRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sls-wire-'))
  tmpRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(activeWatchers.map((w) => w.stop()))
  activeWatchers = []
  for (const root of tmpRoots) {
    await fs.rm(root, { recursive: true, force: true })
  }
  tmpRoots = []
})

function track(wired) {
  activeWatchers.push(...wired.watchers)
  return wired
}

test('ensures buckets from the registry', async () => {
  const bucketsRoot = await makeBucketsRoot()
  const registry = createRegistry()
  registerS3Bucket(registry, {
    logicalId: 'UploadsBucket',
    name: 'uploads',
    arn: 'arn:aws:s3:::uploads',
    properties: {},
  })
  const store = createBucketStore()
  const { getLambdaFunction } = makeLambdas()

  const wired = track(
    await wireS3({
      serverless: makeServerless(),
      registry,
      store,
      getLambdaFunction,
      logger: makeLogger(),
      bucketsRoot,
    }),
  )

  expect(store.hasBucket('uploads')).toBe(true)
  expect(wired.bucketCount).toBe(1)
  expect(wired.watchers).toHaveLength(1)
})

test('ensures buckets from events: - s3 (string and object forms)', async () => {
  const bucketsRoot = await makeBucketsRoot()
  const registry = createRegistry()
  const store = createBucketStore()
  const { getLambdaFunction } = makeLambdas()

  const wired = track(
    await wireS3({
      serverless: makeServerless({
        functions: {
          a: { events: [{ s3: 'string-bucket' }] },
          b: {
            events: [
              { s3: { bucket: 'object-bucket', event: 's3:ObjectCreated:*' } },
            ],
          },
        },
      }),
      registry,
      store,
      getLambdaFunction,
      logger: makeLogger(),
      bucketsRoot,
    }),
  )

  expect(store.hasBucket('string-bucket')).toBe(true)
  expect(store.hasBucket('object-bucket')).toBe(true)
  expect(wired.bucketCount).toBe(2)
})

test('derives notification configs (default event + rules) and honours them', async () => {
  const bucketsRoot = await makeBucketsRoot()
  const registry = createRegistry()
  const mut = { fn: null }
  const store = createBucketStore({ onMutation: (ev) => mut.fn?.(ev) })
  const { getLambdaFunction, calls } = makeLambdas()

  const wired = track(
    await wireS3({
      serverless: makeServerless({
        functions: {
          // No explicit event → default s3:ObjectCreated:* applies.
          plain: { events: [{ s3: 'plain-bucket' }] },
          // Explicit ObjectRemoved:* + a prefix rule.
          full: {
            events: [
              {
                s3: {
                  bucket: 'full-bucket',
                  event: 's3:ObjectRemoved:*',
                  rules: [{ prefix: 'in/' }],
                },
              },
            ],
          },
        },
      }),
      registry,
      store,
      getLambdaFunction,
      logger: makeLogger(),
      bucketsRoot,
    }),
  )
  mut.fn = wired.onMutation

  expect(wired.bucketCount).toBe(2)

  // A put on plain-bucket matches the default ObjectCreated:* config.
  store.putObject('plain-bucket', 'x.txt', { body: Buffer.from('1') })
  // A put on full-bucket must NOT match its ObjectRemoved:* config.
  store.putObject('full-bucket', 'in/y.txt', { body: Buffer.from('2') })
  // A delete on full-bucket under the prefix matches; outside it does not.
  store.deleteObject('full-bucket', 'in/y.txt')
  store.putObject('full-bucket', 'out/z.txt', { body: Buffer.from('3') })
  store.deleteObject('full-bucket', 'out/z.txt')

  await waitFor(() => calls.length === 2)
  await new Promise((resolve) => setTimeout(resolve, 100))

  const byFn = calls.map((c) => c.functionKey).sort()
  expect(byFn).toEqual(['full', 'plain'])
})

test('onMutation delivers a notification to the matching function', async () => {
  const bucketsRoot = await makeBucketsRoot()
  const registry = createRegistry()
  const store = createBucketStore({ onMutation: (ev) => mut.fn?.(ev) })
  const mut = { fn: null }
  const { getLambdaFunction, calls } = makeLambdas()

  const wired = track(
    await wireS3({
      serverless: makeServerless({
        functions: {
          onUpload: {
            events: [
              { s3: { bucket: 'uploads', event: 's3:ObjectCreated:*' } },
            ],
          },
        },
      }),
      registry,
      store,
      getLambdaFunction,
      logger: makeLogger(),
      bucketsRoot,
    }),
  )
  mut.fn = wired.onMutation

  // An SDK put (no origin) fires onMutation → notifier → invoke.
  store.putObject('uploads', 'a.txt', { body: Buffer.from('hi') })

  await waitFor(() => calls.length === 1)
  expect(calls[0].functionKey).toBe('onUpload')
  expect(calls[0].event.Records[0].s3.object.key).toBe('a.txt')
})

test('onMutation mirrors an SDK write to the drop folder (suppressed, no loop)', async () => {
  const bucketsRoot = await makeBucketsRoot()
  const registry = createRegistry()
  registerS3Bucket(registry, {
    logicalId: 'UploadsBucket',
    name: 'uploads',
    arn: 'arn:aws:s3:::uploads',
    properties: {},
  })
  const mut = { fn: null }
  const store = createBucketStore({ onMutation: (ev) => mut.fn?.(ev) })
  const { getLambdaFunction } = makeLambdas()

  const wired = track(
    await wireS3({
      serverless: makeServerless(),
      registry,
      store,
      getLambdaFunction,
      logger: makeLogger(),
      bucketsRoot,
    }),
  )
  mut.fn = wired.onMutation

  // SDK write → mirror should produce the file on disk...
  store.putObject('uploads', 'sdk.bin', { body: Buffer.from('payload') })
  // Spy AFTER the SDK put so it only sees any (unwanted) watcher-originated put.
  const putSpy = jest.spyOn(store, 'putObject')

  const filePath = path.join(bucketsRoot, 'uploads', 'sdk.bin')
  await waitFor(async () => {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  })
  const onDisk = await fs.readFile(filePath)
  expect(onDisk.toString()).toBe('payload')

  // ...and the resulting chokidar add (suppressed) must NOT re-put the object.
  await new Promise((resolve) => setTimeout(resolve, 400))
  // No watcher-originated put: the mirrored write was suppressed.
  expect(putSpy).not.toHaveBeenCalled()
  putSpy.mockRestore()
})

test('onMutation mirrors a delete by unlinking the drop-folder file', async () => {
  const bucketsRoot = await makeBucketsRoot()
  const registry = createRegistry()
  registerS3Bucket(registry, {
    logicalId: 'UploadsBucket',
    name: 'uploads',
    arn: 'arn:aws:s3:::uploads',
    properties: {},
  })
  const mut = { fn: null }
  const store = createBucketStore({ onMutation: (ev) => mut.fn?.(ev) })
  const { getLambdaFunction } = makeLambdas()

  const wired = track(
    await wireS3({
      serverless: makeServerless(),
      registry,
      store,
      getLambdaFunction,
      logger: makeLogger(),
      bucketsRoot,
    }),
  )
  mut.fn = wired.onMutation

  store.putObject('uploads', 'temp.txt', { body: Buffer.from('x') })
  const filePath = path.join(bucketsRoot, 'uploads', 'temp.txt')
  await waitFor(async () => {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  })

  store.deleteObject('uploads', 'temp.txt')
  await waitFor(async () => {
    try {
      await fs.access(filePath)
      return false
    } catch {
      return true
    }
  })
})

test('a drop-folder originated mutation is NOT mirrored back (origin guard)', async () => {
  const bucketsRoot = await makeBucketsRoot()
  const registry = createRegistry()
  registerS3Bucket(registry, {
    logicalId: 'UploadsBucket',
    name: 'uploads',
    arn: 'arn:aws:s3:::uploads',
    properties: {},
  })
  const mut = { fn: null }
  const store = createBucketStore({ onMutation: (ev) => mut.fn?.(ev) })
  const { getLambdaFunction } = makeLambdas()

  const wired = track(
    await wireS3({
      serverless: makeServerless(),
      registry,
      store,
      getLambdaFunction,
      logger: makeLogger(),
      bucketsRoot,
    }),
  )
  mut.fn = wired.onMutation

  // A mutation tagged origin:'drop-folder' must not be mirrored back to disk
  // (the file is what produced the mutation in the first place).
  const dir = path.join(bucketsRoot, 'uploads')

  wired.onMutation({
    bucket: 'uploads',
    key: 'fromfs.txt',
    eventName: 'ObjectCreated:Put',
    size: 3,
    etag: '"x"',
    sequencer: '0000000000000001',
    origin: 'drop-folder',
  })

  await new Promise((resolve) => setTimeout(resolve, 200))

  let wrote = false
  try {
    await fs.access(path.join(dir, 'fromfs.txt'))
    wrote = true
  } catch {
    wrote = false
  }
  expect(wrote).toBe(false)
})
