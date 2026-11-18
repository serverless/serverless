import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import downloadS3Object from '../../../../../../lib/plugins/aws/utils/download-s3-object.js'

describe('downloadS3Object', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'download-s3-object-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const s3Object = { Bucket: 'artifacts', Key: 'builds/app.zip' }

  it('writes a streamed body (SDK v3) to the file', async () => {
    const request = jest
      .fn()
      .mockResolvedValue({ Body: Readable.from([Buffer.from('zip bytes')]) })
    const filePath = path.join(dir, 'app.zip')

    await expect(
      downloadS3Object({
        provider: { request },
        s3Object,
        filePath,
        region: 'eu-west-1',
      }),
    ).resolves.toBe(filePath)

    expect(fs.readFileSync(filePath, 'utf8')).toBe('zip bytes')
    expect(request).toHaveBeenCalledWith('S3', 'getObject', s3Object, {
      region: 'eu-west-1',
    })
  })

  it('writes a buffered body (SDK v2) to the file', async () => {
    const request = jest
      .fn()
      .mockResolvedValue({ Body: Buffer.from('buffered bytes') })
    const filePath = path.join(dir, 'app.zip')

    await downloadS3Object({ provider: { request }, s3Object, filePath })

    expect(fs.readFileSync(filePath, 'utf8')).toBe('buffered bytes')
  })

  it('passes a request error through', async () => {
    const error = new Error('Access Denied')
    const request = jest.fn().mockRejectedValue(error)

    await expect(
      downloadS3Object({
        provider: { request },
        s3Object,
        filePath: path.join(dir, 'app.zip'),
      }),
    ).rejects.toBe(error)
  })
})
