import { jest } from '@jest/globals'
import path from 'path'
import {
  persistArtifacts,
  readUploadManifest,
  UPLOAD_MANIFEST,
} from '../../../../../../../lib/plugins/aws/sandboxes/packaging/persist.js'

function makeFs() {
  const files = {}
  return {
    files,
    mkdir: jest.fn(async () => {}),
    writeFile: jest.fn(async (p, data) => {
      files[String(p)] = data
    }),
    readFile: jest.fn(async (p) => {
      if (files[String(p)] === undefined) {
        throw Object.assign(new Error('no'), { code: 'ENOENT' })
      }
      return files[String(p)]
    }),
  }
}

test('persistArtifacts writes each zip + a manifest into the package dir', async () => {
  const fs = makeFs()
  const pendingUploads = new Map([
    [
      'runner',
      {
        key: 'serverless/svc/dev/sandboxes/runner-abc123.zip',
        zipBuffer: Buffer.from('zip-bytes'),
      },
    ],
  ])
  const entries = await persistArtifacts({
    packageDir: '/pkg',
    pendingUploads,
    fs,
  })
  expect(entries).toEqual([
    {
      name: 'runner',
      key: 'serverless/svc/dev/sandboxes/runner-abc123.zip',
      file: 'sandboxes/runner-abc123.zip',
    },
  ])
  // the zip is written under the package dir, and the manifest alongside it.
  // The write path uses native path.join (backslashes on Windows), so key the
  // lookup the same way rather than a hard-coded POSIX string.
  expect(fs.files[path.join('/pkg', 'sandboxes', 'runner-abc123.zip')]).toEqual(
    Buffer.from('zip-bytes'),
  )
  expect(JSON.parse(fs.files[path.join('/pkg', UPLOAD_MANIFEST)])).toEqual(
    entries,
  )
})

test('persistArtifacts writes no manifest when there are no artifacts (s3:// only)', async () => {
  const fs = makeFs()
  const entries = await persistArtifacts({
    packageDir: '/pkg',
    pendingUploads: new Map(),
    fs,
  })
  expect(entries).toEqual([])
  expect(fs.writeFile).not.toHaveBeenCalled()
})

test('readUploadManifest round-trips what persistArtifacts wrote', async () => {
  const fs = makeFs()
  const pendingUploads = new Map([
    ['runner', { key: 'k/runner-x.zip', zipBuffer: Buffer.from('z') }],
  ])
  await persistArtifacts({ packageDir: '/pkg', pendingUploads, fs })
  const manifest = await readUploadManifest({ packageDir: '/pkg', fs })
  expect(manifest).toEqual([
    { name: 'runner', key: 'k/runner-x.zip', file: 'sandboxes/runner-x.zip' },
  ])
})

test('readUploadManifest returns [] when no manifest exists', async () => {
  const fs = makeFs()
  expect(await readUploadManifest({ packageDir: '/pkg', fs })).toEqual([])
})
