import { jest } from '@jest/globals'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createBucketStore } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/s3/bucket-store.js'
import { createDropFolderWatcher } from '../../../../../../../../lib/plugins/aws/offline/lib/event-sources/s3-drop-folder.js'

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
 * Resolve once a predicate holds, polling on a short interval. Fails the test
 * with a timeout rather than hanging if the condition never becomes true.
 */
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

async function makeTmpDir() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sls-drop-'))
  tmpRoots.push(root)
  return root
}

afterEach(async () => {
  for (const root of tmpRoots) {
    await fs.rm(root, { recursive: true, force: true })
  }
  tmpRoots = []
})

test('creates the dir and a .gitignore on start', async () => {
  const root = await makeTmpDir()
  const dir = path.join(root, 'buckets', 'uploads')
  const store = createBucketStore()
  store.createBucket('uploads')

  const watcher = await createDropFolderWatcher({
    store,
    bucketName: 'uploads',
    dir,
    logger: makeLogger(),
  })

  try {
    const gitignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf8')
    expect(gitignore).toBe('*\n')
  } finally {
    await watcher.stop()
  }
})

test('seeds an existing file into the store on start', async () => {
  const root = await makeTmpDir()
  const dir = path.join(root, 'uploads')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'seed.txt'), 'hello')

  const store = createBucketStore()
  store.createBucket('uploads')

  const watcher = await createDropFolderWatcher({
    store,
    bucketName: 'uploads',
    dir,
    logger: makeLogger(),
  })

  try {
    await waitFor(() => store.headObject('uploads', 'seed.txt') !== null)
    const object = store.getObject('uploads', 'seed.txt')
    expect(object.body.toString()).toBe('hello')
  } finally {
    await watcher.stop()
  }
})

test('drops a new file → the store gains the object', async () => {
  const root = await makeTmpDir()
  const dir = path.join(root, 'uploads')
  const store = createBucketStore()
  store.createBucket('uploads')

  const watcher = await createDropFolderWatcher({
    store,
    bucketName: 'uploads',
    dir,
    logger: makeLogger(),
  })

  try {
    await fs.mkdir(path.join(dir, 'nested'), { recursive: true })
    await fs.writeFile(path.join(dir, 'nested', 'a.json'), '{"x":1}')

    await waitFor(() => store.headObject('uploads', 'nested/a.json') !== null)
    const object = store.getObject('uploads', 'nested/a.json')
    expect(object.body.toString()).toBe('{"x":1}')
    // Content type is derived from the extension.
    expect(object.contentType).toBe('application/json')
  } finally {
    await watcher.stop()
  }
})

test('unlinking a file removes the object from the store', async () => {
  const root = await makeTmpDir()
  const dir = path.join(root, 'uploads')
  const store = createBucketStore()
  store.createBucket('uploads')

  const watcher = await createDropFolderWatcher({
    store,
    bucketName: 'uploads',
    dir,
    logger: makeLogger(),
  })

  try {
    const file = path.join(dir, 'gone.txt')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(file, 'bye')
    await waitFor(() => store.headObject('uploads', 'gone.txt') !== null)

    await fs.rm(file)
    await waitFor(() => store.headObject('uploads', 'gone.txt') === null)
  } finally {
    await watcher.stop()
  }
})

test('a mirrored (suppressed) file write does NOT re-enter the store', async () => {
  const root = await makeTmpDir()
  const dir = path.join(root, 'uploads')
  const store = createBucketStore()
  store.createBucket('uploads')

  const putSpy = jest.spyOn(store, 'putObject')

  const watcher = await createDropFolderWatcher({
    store,
    bucketName: 'uploads',
    dir,
    logger: makeLogger(),
  })

  try {
    // Simulate what the boot mirror does: register the path as suppressed
    // BEFORE writing the file, so the watcher skips the resulting add event.
    watcher.suppress.add('mirror.txt')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'mirror.txt'), 'mirrored')

    // Give chokidar time to (not) act on the suppressed write.
    await new Promise((resolve) => setTimeout(resolve, 400))

    // The suppressed write must not have produced a store put.
    expect(putSpy).not.toHaveBeenCalled()
  } finally {
    putSpy.mockRestore()
    await watcher.stop()
  }
})

test('an identical re-write of an already-stored object does not re-put (idempotent)', async () => {
  const root = await makeTmpDir()
  const dir = path.join(root, 'uploads')
  const store = createBucketStore()
  store.createBucket('uploads')

  const watcher = await createDropFolderWatcher({
    store,
    bucketName: 'uploads',
    dir,
    logger: makeLogger(),
  })

  try {
    const file = path.join(dir, 'same.txt')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(file, 'constant')
    await waitFor(() => store.headObject('uploads', 'same.txt') !== null)

    const putSpy = jest.spyOn(store, 'putObject')
    // Re-write identical bytes; chokidar fires a change, but the bytes already
    // equal the stored body so the watcher must short-circuit.
    await fs.writeFile(file, 'constant')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(putSpy).not.toHaveBeenCalled()
    putSpy.mockRestore()
  } finally {
    await watcher.stop()
  }
})

test('stop() is safe to call twice', async () => {
  const root = await makeTmpDir()
  const dir = path.join(root, 'uploads')
  const store = createBucketStore()
  store.createBucket('uploads')

  const watcher = await createDropFolderWatcher({
    store,
    bucketName: 'uploads',
    dir,
    logger: makeLogger(),
  })

  await watcher.stop()
  await expect(watcher.stop()).resolves.toBeUndefined()
})
