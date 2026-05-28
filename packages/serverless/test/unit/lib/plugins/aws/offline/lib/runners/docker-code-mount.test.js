import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import JsZip from 'jszip'
import {
  extractZipBuffer,
  resolveDockerCodeMount,
  rewriteDockerHostServicePath,
} from '../../../../../../../../lib/plugins/aws/offline/lib/runners/docker-code-mount.js'

async function makeTempService() {
  return mkdtemp(path.join(tmpdir(), 'docker-code-mount-'))
}

async function writeZip(zipPath, entries) {
  const zip = new JsZip()
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content)
  }
  await writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer' }))
}

describe('docker-code-mount', () => {
  const tempDirs = []

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    )
  })

  it('mounts source handler codeDir at /var/task', async () => {
    const servicePath = await makeTempService()
    tempDirs.push(servicePath)
    const codeDir = path.join(servicePath, '.esbuild', '.build')
    await mkdir(codeDir, { recursive: true })

    const result = await resolveDockerCodeMount({
      servicePath,
      codeDir,
      handlerBaseDir: codeDir,
    })

    expect(result).toMatchObject({
      kind: 'source',
      extraLayerMounts: [],
      mounts: [{ source: codeDir, target: '/var/task', readOnly: true }],
    })
  })

  it('rewrites bind paths through dockerHostServicePath', async () => {
    const servicePath = await makeTempService()
    tempDirs.push(servicePath)
    const hostPath = '/host/service'

    expect(
      rewriteDockerHostServicePath(
        path.join(
          servicePath,
          '.serverless-offline',
          'docker-artifacts',
          'abc',
        ),
        { servicePath, dockerHostServicePath: hostPath },
      ),
    ).toBe(
      path.join(hostPath, '.serverless-offline', 'docker-artifacts', 'abc'),
    )

    expect(
      rewriteDockerHostServicePath('/outside/service/file.js', {
        servicePath,
        dockerHostServicePath: hostPath,
      }),
    ).toBe('/outside/service/file.js')
  })

  it('extracts ZIP artifacts to a content-hashed cache directory', async () => {
    const servicePath = await makeTempService()
    tempDirs.push(servicePath)
    const artifactPath = path.join(servicePath, '.serverless', 'fn.zip')
    await mkdir(path.dirname(artifactPath), { recursive: true })
    await writeZip(artifactPath, {
      'handler.js': 'exports.main = async () => "ok"\n',
      'lib/util.js': 'exports.value = 1\n',
    })
    const artifactBuffer = await readFile(artifactPath)
    const artifactHash = createHash('sha256')
      .update(artifactBuffer)
      .digest('hex')

    const result = await resolveDockerCodeMount({
      servicePath,
      artifactPath,
      runtime: 'nodejs20.x',
    })

    const expectedCodeDir = path.join(
      servicePath,
      '.serverless-offline',
      'docker-artifacts',
      artifactHash,
      'code',
    )
    expect(result).toMatchObject({
      kind: 'zip-artifact',
      artifactHash,
      codeDir: expectedCodeDir,
      extraLayerMounts: [],
      mounts: [
        { source: expectedCodeDir, target: '/var/task', readOnly: true },
      ],
    })
    await expect(
      readFile(path.join(expectedCodeDir, 'handler.js'), 'utf8'),
    ).resolves.toBe('exports.main = async () => "ok"\n')
    await expect(
      stat(path.join(expectedCodeDir, 'lib', 'util.js')),
    ).resolves.toMatchObject({ size: 18 })
  })

  it('mounts Java JAR artifact directories at /var/task/lib', async () => {
    const servicePath = await makeTempService()
    tempDirs.push(servicePath)
    const artifactDir = path.join(servicePath, 'target')
    const artifactPath = path.join(artifactDir, 'service.jar')
    await mkdir(artifactDir, { recursive: true })
    await writeFile(artifactPath, 'jar')

    const result = await resolveDockerCodeMount({
      servicePath,
      artifactPath,
      runtime: 'java21',
    })

    expect(result).toMatchObject({
      kind: 'java-jar',
      codeDir: artifactDir,
      extraLayerMounts: [],
      mounts: [
        { source: artifactDir, target: '/var/task/lib', readOnly: true },
      ],
    })
  })

  it('mounts prebuilt custom runtime bootstrap artifact directories at /var/task', async () => {
    const servicePath = await makeTempService()
    tempDirs.push(servicePath)
    const artifactDir = path.join(servicePath, 'dist')
    const artifactPath = path.join(artifactDir, 'bootstrap')
    await mkdir(artifactDir, { recursive: true })
    await writeFile(artifactPath, '#!/bin/sh\n')

    const result = await resolveDockerCodeMount({
      servicePath,
      artifactPath,
      runtime: 'provided.al2',
    })

    expect(result).toMatchObject({
      kind: 'bootstrap-artifact',
      codeDir: artifactDir,
      extraLayerMounts: [],
      mounts: [{ source: artifactDir, target: '/var/task', readOnly: true }],
    })
  })

  it('rejects ZIP buffers with path-traversal entries', async () => {
    const destDir = await makeTempService()
    tempDirs.push(destDir)
    const zip = new JsZip()
    zip.file('/etc/evil.txt', 'pwned')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    await expect(extractZipBuffer(buffer, destDir)).rejects.toThrow(
      /Unsafe ZIP entry path/,
    )
  })

  it('extracts ZIP buffer entries preserving their paths under destDir', async () => {
    const destDir = await makeTempService()
    tempDirs.push(destDir)
    const zip = new JsZip()
    zip.file('nodejs/node_modules/x/index.js', 'module.exports = 1\n')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    await extractZipBuffer(buffer, destDir)

    await expect(
      readFile(
        path.join(destDir, 'nodejs', 'node_modules', 'x', 'index.js'),
        'utf8',
      ),
    ).resolves.toBe('module.exports = 1\n')
  })

  it('applies dockerHostServicePath rewrites to resolved mounts', async () => {
    const servicePath = await makeTempService()
    tempDirs.push(servicePath)
    const codeDir = path.join(servicePath, 'src')
    await mkdir(codeDir, { recursive: true })

    const result = await resolveDockerCodeMount({
      servicePath,
      codeDir,
      dockerHostServicePath: '/host/service',
    })

    expect(result.mounts[0].source).toBe('/host/service/src')
    expect(result.codeDir).toBe(codeDir)
  })
})
