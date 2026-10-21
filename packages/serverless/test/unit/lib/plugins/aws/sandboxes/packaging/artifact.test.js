import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { computeCodeArtifact } from '../../../../../../../lib/plugins/aws/sandboxes/packaging/artifact.js'

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

  test('s3 key starts with the deployment prefix', async () => {
    const result = await computeCodeArtifact(
      { artifact: '/tmp/code-dir' },
      {
        deploymentPrefix: 'custom/prefix',
        serviceName: 'my-svc',
        stage: 'prod',
        name: 'api',
        zipDir: async () => Buffer.from('hello'),
      },
    )
    expect(result.key).toMatch(
      /^custom\/prefix\/my-svc\/prod\/sandboxes\/api-[a-f0-9]+\.zip$/,
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
    // runs from a different cwd (test harness, `-c path`, compose). Resolve the
    // expected path the same way the impl does so this holds on Windows too.
    expect(seen[0]).toBe(path.resolve('/svc/root', './app'))
  })

  test('throws a clear error when the artifact directory does not exist (no silent empty zip)', async () => {
    await expect(
      computeCodeArtifact(
        { artifact: '/nonexistent/sandboxes-artifact-xyz-123' },
        { serviceName: 's', stage: 'dev', name: 'echo', serviceDir: '/' },
      ),
    ).rejects.toThrow(/artifact directory not found/)
    await expect(
      computeCodeArtifact(
        { artifact: '/nonexistent/sandboxes-artifact-xyz-123' },
        { serviceName: 's', stage: 'dev', name: 'echo', serviceDir: '/' },
      ),
    ).rejects.toMatchObject({
      code: 'SANDBOXES_ARTIFACT_NOT_FOUND',
      stack: undefined,
    })
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
    await expect(
      computeCodeArtifact(
        { artifact: dir },
        { serviceName: 's', stage: 'dev', name: 'echo', serviceDir: '/' },
      ),
    ).rejects.toMatchObject({
      code: 'SANDBOXES_DOCKERFILE_NOT_FOUND',
      stack: undefined,
    })
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

  test('zips only the files the package patterns select (no zipDir stub)', async () => {
    const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-patterns-'))
    for (const file of [
      'Dockerfile',
      'serverless.yml',
      'src/server.mjs',
      'src/test.spec.mjs',
      '.git/HEAD',
      'node_modules/a/index.js',
      'venv/bin/python',
    ]) {
      fs.mkdirSync(path.dirname(path.join(serviceDir, file)), {
        recursive: true,
      })
      fs.writeFileSync(path.join(serviceDir, file), file)
    }
    const serverless = {
      configurationFilename: 'serverless.yml',
      configurationInput: {},
      service: {
        package: { patterns: ['!src/*.spec.mjs'] },
        getAllLayers: () => [],
      },
      pluginManager: { parsePluginsObject: () => ({}) },
    }
    const r = await computeCodeArtifact(
      { artifact: '.', package: { patterns: ['node_modules/a/**'] } },
      { serviceName: 's', stage: 'dev', name: 'echo', serviceDir, serverless },
    )
    expect(
      new AdmZip(r.zipBuffer).getEntries().map((e) => e.entryName),
    ).toEqual(['Dockerfile', 'node_modules/a/index.js', 'src/server.mjs'])
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

describe('computeCodeArtifact — deterministic zipping (stable content-addressed key)', () => {
  // Build an artifact dir (Dockerfile + files in a subdir) so the real archiver
  // path runs (no zipDir stub). The content-addressed key encodes the zip's
  // sha256, so byte-stable zips ⇒ stable keys across machines/CI.
  const mkArtifactDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-deterministic-'))
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM scratch\n')
    fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("hi")\n')
    fs.mkdirSync(path.join(dir, 'lib'))
    fs.writeFileSync(path.join(dir, 'lib', 'util.js'), 'export const x = 1\n')
    return dir
  }
  const zipFor = (dir) =>
    computeCodeArtifact(
      { artifact: dir },
      { serviceName: 's', stage: 'dev', name: 'echo', serviceDir: '/' },
    ).then((r) => r.zipBuffer)
  const keyFor = (dir) =>
    computeCodeArtifact(
      { artifact: dir },
      { serviceName: 's', stage: 'dev', name: 'echo', serviceDir: '/' },
    ).then((r) => r.key)

  test('every entry carries a normalized timestamp, not the live file mtime', async () => {
    const entries = new AdmZip(await zipFor(mkArtifactDir())).getEntries()
    expect(entries.length).toBeGreaterThan(0)
    // The live mtime would be the current year; pinning each entry to a fixed
    // sentinel is what keeps the hash stable across checkouts/machines.
    const currentYear = new Date().getUTCFullYear()
    for (const e of entries) {
      expect(e.header.time.getUTCFullYear()).toBeLessThan(currentYear)
    }
    // …and all entries share that one pinned timestamp.
    const distinctTimes = new Set(entries.map((e) => e.header.time.getTime()))
    expect(distinctTimes.size).toBe(1)
  })

  test('entries are emitted in deterministic (path-sorted) order', async () => {
    const names = new AdmZip(await zipFor(mkArtifactDir()))
      .getEntries()
      .map((e) => e.entryName)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  test('identical content zipped twice yields the same key', async () => {
    const dir = mkArtifactDir()
    expect(await keyFor(dir)).toBe(await keyFor(dir))
  })

  test('two separate dirs with identical content yield the same key', async () => {
    expect(await keyFor(mkArtifactDir())).toBe(await keyFor(mkArtifactDir()))
  })
})
