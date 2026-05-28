import { jest } from '@jest/globals'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import JsZip from 'jszip'
import { downloadLayerSet } from '../../../../../../../../../lib/plugins/aws/offline/lib/runners/layers/layer-downloader.js'

async function zipBuffer(entries) {
  const zip = new JsZip()
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content)
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

function arrayBufferResponse(buffer) {
  return {
    ok: true,
    arrayBuffer: async () =>
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
  }
}

describe('downloadLayerSet', () => {
  const tempDirs = []
  let lambdaClient
  let logger
  let fetchSpy

  beforeEach(() => {
    lambdaClient = { send: jest.fn() }
    logger = { warning: jest.fn(), debug: jest.fn() }
    fetchSpy = jest.spyOn(global, 'fetch')
  })

  afterEach(async () => {
    fetchSpy.mockRestore()
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    )
  })

  async function makeLayersDir() {
    const dir = await mkdtemp(path.join(tmpdir(), 'layer-downloader-'))
    tempDirs.push(dir)
    return dir
  }

  it('downloads and extracts a single ARN, writing the cache marker', async () => {
    const layersDir = await makeLayersDir()
    lambdaClient.send.mockResolvedValue({
      Content: { Location: 'https://x/l.zip' },
    })
    fetchSpy.mockResolvedValue(
      arrayBufferResponse(
        await zipBuffer({ 'nodejs/node_modules/x/v.txt': 'A' }),
      ),
    )

    const result = await downloadLayerSet({
      arns: ['arn:aws:lambda:us-east-1:1:layer:a:1'],
      setKey: 'set-one',
      layersDir,
      lambdaClient,
      logger,
    })

    expect(result.ok).toBe(true)
    const optDir = path.join(layersDir, 'set-one')
    expect(result.optDir).toBe(optDir)
    await expect(
      readFile(
        path.join(optDir, 'nodejs', 'node_modules', 'x', 'v.txt'),
        'utf8',
      ),
    ).resolves.toBe('A')
    await expect(
      readFile(path.join(optDir, '.layers.json'), 'utf8'),
    ).resolves.toContain('set-one')
  })

  it('overlays later ARNs over earlier ones', async () => {
    const layersDir = await makeLayersDir()
    lambdaClient.send
      .mockResolvedValueOnce({ Content: { Location: 'https://x/a.zip' } })
      .mockResolvedValueOnce({ Content: { Location: 'https://x/b.zip' } })
    fetchSpy
      .mockResolvedValueOnce(
        arrayBufferResponse(
          await zipBuffer({ 'nodejs/node_modules/x/v.txt': 'A' }),
        ),
      )
      .mockResolvedValueOnce(
        arrayBufferResponse(
          await zipBuffer({ 'nodejs/node_modules/x/v.txt': 'B' }),
        ),
      )

    const result = await downloadLayerSet({
      arns: [
        'arn:aws:lambda:us-east-1:1:layer:a:1',
        'arn:aws:lambda:us-east-1:1:layer:b:1',
      ],
      setKey: 'set-two',
      layersDir,
      lambdaClient,
      logger,
    })

    expect(result.ok).toBe(true)
    await expect(
      readFile(
        path.join(result.optDir, 'nodejs', 'node_modules', 'x', 'v.txt'),
        'utf8',
      ),
    ).resolves.toBe('B')
  })

  it('returns the cached dir without network when the marker exists', async () => {
    const layersDir = await makeLayersDir()
    const optDir = path.join(layersDir, 'set-cached')
    await mkdir(optDir, { recursive: true })
    await writeFile(
      path.join(optDir, '.layers.json'),
      JSON.stringify({
        arns: ['arn:aws:lambda:us-east-1:1:layer:a:1'],
        setKey: 'set-cached',
      }),
    )

    const result = await downloadLayerSet({
      arns: ['arn:aws:lambda:us-east-1:1:layer:a:1'],
      setKey: 'set-cached',
      layersDir,
      lambdaClient,
      logger,
    })

    expect(result).toEqual({ optDir, ok: true })
    expect(lambdaClient.send).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('soft-warns and skips when the layer lookup rejects', async () => {
    const layersDir = await makeLayersDir()
    lambdaClient.send.mockRejectedValue(new Error('boom'))

    const result = await downloadLayerSet({
      arns: ['arn:aws:lambda:us-east-1:1:layer:a:1'],
      setKey: 'set-fail',
      layersDir,
      lambdaClient,
      logger,
    })

    expect(result.ok).toBe(false)
    expect(logger.warning).toHaveBeenCalledTimes(1)
    await expect(
      readFile(path.join(result.optDir, '.layers.json'), 'utf8'),
    ).rejects.toThrow()
  })

  it('soft-warns when Content.Location is missing', async () => {
    const layersDir = await makeLayersDir()
    lambdaClient.send.mockResolvedValue({})

    const result = await downloadLayerSet({
      arns: ['arn:aws:lambda:us-east-1:1:layer:a:1'],
      setKey: 'set-noloc',
      layersDir,
      lambdaClient,
      logger,
    })

    expect(result.ok).toBe(false)
    expect(logger.warning).toHaveBeenCalledTimes(1)
  })

  it('soft-warns when the presigned fetch is not ok', async () => {
    const layersDir = await makeLayersDir()
    lambdaClient.send.mockResolvedValue({
      Content: { Location: 'https://x/l.zip' },
    })
    fetchSpy.mockResolvedValue({ ok: false, status: 403 })

    const result = await downloadLayerSet({
      arns: ['arn:aws:lambda:us-east-1:1:layer:a:1'],
      setKey: 'set-403',
      layersDir,
      lambdaClient,
      logger,
    })

    expect(result.ok).toBe(false)
    expect(logger.warning).toHaveBeenCalledTimes(1)
  })

  it('re-downloads on the next call after a failed set wrote no marker', async () => {
    const layersDir = await makeLayersDir()
    // First attempt fails (no marker should be written).
    lambdaClient.send.mockRejectedValueOnce(new Error('boom'))

    const first = await downloadLayerSet({
      arns: ['arn:aws:lambda:us-east-1:1:layer:a:1'],
      setKey: 'set-retry',
      layersDir,
      lambdaClient,
      logger,
    })
    expect(first.ok).toBe(false)
    await expect(
      readFile(path.join(first.optDir, '.layers.json'), 'utf8'),
    ).rejects.toThrow()

    // Second attempt succeeds: because no marker exists, it hits the network
    // again, extracts, and writes the marker.
    lambdaClient.send.mockResolvedValueOnce({
      Content: { Location: 'https://x/l.zip' },
    })
    fetchSpy.mockResolvedValueOnce(
      arrayBufferResponse(
        await zipBuffer({ 'nodejs/node_modules/x/v.txt': 'A' }),
      ),
    )

    const second = await downloadLayerSet({
      arns: ['arn:aws:lambda:us-east-1:1:layer:a:1'],
      setKey: 'set-retry',
      layersDir,
      lambdaClient,
      logger,
    })

    expect(second.ok).toBe(true)
    expect(lambdaClient.send).toHaveBeenCalledTimes(2)
    await expect(
      readFile(path.join(second.optDir, '.layers.json'), 'utf8'),
    ).resolves.toContain('set-retry')
  })
})
