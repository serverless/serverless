import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  computeCodeArtifact,
  uploadArtifact,
} from '../../../../../../../lib/plugins/aws/sandboxes/packaging/artifact.js'

describe('computeCodeArtifact', () => {
  test('passes through an s3:// artifact unchanged', async () => {
    const result = await computeCodeArtifact({ artifact: 's3://b/k.zip' }, {})
    expect(result).toEqual({
      uri: 's3://b/k.zip',
      key: undefined,
      zipBuffer: undefined,
    })
  })

  test('zips a local dir and returns key+zipBuffer with no AWS calls', async () => {
    const zipBuf = Buffer.from('zip')
    const result = await computeCodeArtifact(
      { artifact: '/tmp/does-not-matter-mocked' },
      {
        serviceName: 'svc',
        stage: 'dev',
        name: 'runner',
        zipDir: async () => zipBuf,
      },
    )
    expect(result.uri).toBeUndefined()
    expect(result.key).toMatch(
      /^serverless\/svc\/dev\/sandboxes\/runner-[a-f0-9]+\.zip$/,
    )
    expect(result.zipBuffer).toBe(zipBuf)
  })

  test('s3 key follows serverless/<service>/<stage>/sandboxes/<name>-<sha>.zip pattern', async () => {
    const result = await computeCodeArtifact(
      { artifact: '/tmp/code-dir' },
      {
        serviceName: 'my-svc',
        stage: 'prod',
        name: 'api',
        zipDir: async () => Buffer.from('hello'),
      },
    )
    expect(result.key).toMatch(
      /^serverless\/my-svc\/prod\/sandboxes\/api-[a-f0-9]+\.zip$/,
    )
  })

  test('two calls with identical content produce the same key (content-addressed)', async () => {
    const zipBuf = Buffer.from('same-content')

    const r1 = await computeCodeArtifact(
      { artifact: '/tmp/dir-a' },
      {
        serviceName: 's',
        stage: 'dev',
        name: 'x',
        zipDir: async () => zipBuf,
      },
    )
    const r2 = await computeCodeArtifact(
      { artifact: '/tmp/dir-b' },
      {
        serviceName: 's',
        stage: 'dev',
        name: 'x',
        zipDir: async () => zipBuf,
      },
    )

    expect(r1.key).toBe(r2.key)
  })

  test('resolves a relative artifact dir against serviceDir, not process.cwd()', async () => {
    const seen = []
    await computeCodeArtifact(
      { artifact: './app' },
      {
        serviceName: 's',
        stage: 'dev',
        name: 'echo',
        serviceDir: '/svc/root',
        zipDir: async (d) => {
          seen.push(d)
          return Buffer.from('z')
        },
      },
    )
    // A cwd-relative './app' would silently zip the wrong/empty dir when the CLI
    // runs from a different cwd (test harness, `-c path`, compose).
    expect(seen[0]).toBe('/svc/root/app')
  })

  test('throws a clear error when the artifact directory does not exist (no silent empty zip)', async () => {
    await expect(
      computeCodeArtifact(
        { artifact: '/nonexistent/sandboxes-artifact-xyz-123' },
        { serviceName: 's', stage: 'dev', name: 'echo', serviceDir: '/' },
      ),
    ).rejects.toThrow(/artifact directory not found/)
  })

  test('throws a clear error when the artifact dir has no Dockerfile (not the opaque build failure)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-nodockerfile-'))
    fs.writeFileSync(path.join(dir, 'app.js'), '// app, but no Dockerfile')
    await expect(
      computeCodeArtifact(
        { artifact: dir },
        { serviceName: 's', stage: 'dev', name: 'echo', serviceDir: '/' },
      ),
    ).rejects.toThrow(/no Dockerfile found/)
  })

  test('zips a real dir that contains a Dockerfile (no zipDir stub)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-withdockerfile-'))
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM scratch')
    const r = await computeCodeArtifact(
      { artifact: dir },
      { serviceName: 's', stage: 'dev', name: 'echo', serviceDir: '/' },
    )
    expect(r.key).toMatch(/sandboxes\/echo-[a-f0-9]+\.zip$/)
    expect(Buffer.isBuffer(r.zipBuffer)).toBe(true)
  })

  test('does NOT call provider.request (no AWS calls during compute)', async () => {
    const provider = { request: jest.fn() }
    await computeCodeArtifact(
      { artifact: '/tmp/dir' },
      {
        serviceName: 'svc',
        stage: 'dev',
        name: 'fn',
        zipDir: async () => Buffer.from('zip-content'),
      },
    )
    expect(provider.request).not.toHaveBeenCalled()
  })
})

describe('uploadArtifact', () => {
  test('calls provider.request S3 upload with correct params', async () => {
    const provider = { request: jest.fn().mockResolvedValue({}) }
    const zipBuf = Buffer.from('zip-content')

    await uploadArtifact({
      provider,
      bucket: 'dep-bucket',
      key: 'serverless/svc/dev/sandboxes/fn-abc123.zip',
      body: zipBuf,
    })

    expect(provider.request).toHaveBeenCalledWith(
      'S3',
      'upload',
      expect.objectContaining({
        Bucket: 'dep-bucket',
        Key: 'serverless/svc/dev/sandboxes/fn-abc123.zip',
        Body: zipBuf,
        ContentType: 'application/zip',
      }),
    )
  })

  test('applies encryption options when deploymentBucketObject is provided', async () => {
    const provider = { request: jest.fn().mockResolvedValue({}) }

    await uploadArtifact({
      provider,
      bucket: 'enc-bucket',
      key: 'some/key.zip',
      body: Buffer.from('data'),
      deploymentBucketObject: { serverSideEncryption: 'AES256' },
    })

    const [, , params] = provider.request.mock.calls[0]
    expect(params.ServerSideEncryption).toBe('AES256')
  })

  test('does NOT apply encryption when deploymentBucketObject is absent', async () => {
    const provider = { request: jest.fn().mockResolvedValue({}) }

    await uploadArtifact({
      provider,
      bucket: 'plain-bucket',
      key: 'some/key.zip',
      body: Buffer.from('data'),
    })

    const [, , params] = provider.request.mock.calls[0]
    expect(params.ServerSideEncryption).toBeUndefined()
  })
})
