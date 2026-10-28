import { createHash } from 'crypto'
import {
  readWebBridgeArtifact,
  uploadWebBridge,
  webBridgeKey,
} from '../../../../../../../lib/plugins/aws/dev/web/bridge-artifact.js'

const BYTES = Buffer.from('the bridge zip')
const SHA256 = createHash('sha256').update(BYTES).digest('hex')

/** The provider calls the upload makes, with S3 answering from `objects`. */
const fakeProvider = (objects = new Map()) => {
  const calls = []
  return {
    calls,
    objects,
    getServerlessDeploymentBucketName: async () => 'deployment-bucket',
    getStage: () => 'dev',
    async request(service, method, params) {
      calls.push([service, method, params])
      if (method === 'headObject') {
        if (objects.has(params.Key)) return {}
        throw Object.assign(new Error('Not Found'), {
          code: 'AWS_S3_HEAD_OBJECT_NOT_FOUND',
          providerError: { statusCode: 404 },
        })
      }
      if (method === 'upload') {
        objects.set(params.Key, params.Body)
        return {}
      }
      throw new Error(`unexpected ${service}.${method}`)
    },
  }
}

const serverless = (deploymentBucketObject) => ({
  service: { service: 'svc', provider: { deploymentBucketObject } },
})

describe('the web bridge artifact', () => {
  test('its key is under the stage, named after the first 16 hex digits of its SHA-256', () => {
    expect(webBridgeKey({ service: 'svc', stage: 'dev', sha256: SHA256 })).toBe(
      `serverless-dev-mode/svc/dev/bridge/${SHA256.slice(0, 16)}.zip`,
    )
  })

  test('is uploaded once per content, with the deployment bucket encryption, and named by bucket and key', async () => {
    const provider = fakeProvider()
    const artifact = { bytes: BYTES, sha256: SHA256 }
    const key = `serverless-dev-mode/svc/dev/bridge/${SHA256.slice(0, 16)}.zip`
    expect(
      await uploadWebBridge({
        provider,
        serverless: serverless({ serverSideEncryption: 'aws:kms' }),
        artifact,
      }),
    ).toEqual({ bucket: 'deployment-bucket', key })
    const uploads = provider.calls.filter(([, method]) => method === 'upload')
    expect(uploads).toEqual([
      [
        'S3',
        'upload',
        expect.objectContaining({
          Bucket: 'deployment-bucket',
          Key: key,
          Body: BYTES,
          ServerSideEncryption: 'aws:kms',
        }),
      ],
    ])

    await uploadWebBridge({ provider, serverless: serverless(), artifact })
    expect(
      provider.calls.filter(([, method]) => method === 'upload'),
    ).toHaveLength(1)
    expect(
      provider.calls.filter(([, method]) => method === 'headObject'),
    ).toHaveLength(2)
  })

  test('reads the zip and its SHA-256; a missing zip says how to get it', async () => {
    expect(
      await readWebBridgeArtifact({
        readFile: async () => BYTES,
        file: '/x/sls-dev-web-bridge.zip',
      }),
    ).toEqual({ bytes: BYTES, sha256: SHA256 })
    const missing = (released) =>
      readWebBridgeArtifact({
        readFile: async () => {
          throw new Error('ENOENT')
        },
        file: '/x/sls-dev-web-bridge.zip',
        released,
      })
    await expect(missing(false)).rejects.toMatchObject({
      code: 'DEV_MODE_WEB_BRIDGE_MISSING',
      message: expect.stringContaining(
        'npm run build:devmode:web-bridge -w @serverless/framework',
      ),
    })
    await expect(missing(true)).rejects.toMatchObject({
      code: 'DEV_MODE_WEB_BRIDGE_MISSING',
      message: expect.stringContaining('Reinstall the Serverless Framework'),
    })
  })
})
