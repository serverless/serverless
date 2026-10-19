import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  collectWebAppArtifacts,
  persistWebAppArtifacts,
} from '../../../../../../../lib/plugins/aws/web-apps/packaging/artifacts.js'
import { givenProvider, givenZip } from '../given.js'

const sha256 = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

describe('web app artifacts', () => {
  let serviceDir
  let packageDir

  beforeEach(() => {
    serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-app-artifacts-'))
    packageDir = path.join(serviceDir, '.serverless')
    fs.mkdirSync(path.join(packageDir, 'webapps'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(serviceDir, { recursive: true, force: true })
  })

  const collect = (webApps, providerConfig = {}, { request } = {}) => {
    const provider = givenProvider(providerConfig)
    if (request) provider.request = request
    return collectWebAppArtifacts({
      serverless: {
        serviceDir,
        service: { service: 'shop' },
        utils: {
          getTmpDirPath: () => fs.mkdtempSync(path.join(serviceDir, 'tmp-')),
        },
      },
      provider,
      webApps,
      packageDir,
    })
  }

  const packagedZip = (name) => path.join(packageDir, 'webapps', `${name}.zip`)

  describe('collectWebAppArtifacts', () => {
    it('keys a packaged zip by the sha256 of its bytes', async () => {
      await givenZip(packagedZip('api'), { 'src/server.js': 'v1' })
      const sha = sha256(packagedZip('api'))

      const artifacts = await collect({ api: { entry: 'src/server.js' } })

      expect(artifacts.get('api')).toEqual({
        key: `serverless/shop/dev/webapps/api-${sha}.zip`,
        sourceFile: packagedZip('api'),
        entrypoint: '__sls_web_bootstrap.mjs',
        prebuilt: false,
      })
    })

    it('uses provider.deploymentPrefix', async () => {
      await givenZip(packagedZip('api'), { 'src/server.js': 'v1' })

      const artifacts = await collect(
        { api: { entry: 'src/server.js' } },
        { deploymentPrefix: 'builds' },
      )

      expect(artifacts.get('api').key).toMatch(
        /^builds\/shop\/dev\/webapps\/api-[0-9a-f]{64}\.zip$/,
      )
    })

    it('gives identical bytes the same key and changed bytes a new one', async () => {
      const webApps = { api: { entry: 'src/server.js' } }
      await givenZip(packagedZip('api'), { 'src/server.js': 'v1' })
      const first = (await collect(webApps)).get('api').key

      await givenZip(packagedZip('api'), { 'src/server.js': 'v1' })
      const same = (await collect(webApps)).get('api').key

      await givenZip(packagedZip('api'), { 'src/server.js': 'v2' })
      const changed = (await collect(webApps)).get('api').key

      expect(same).toBe(first)
      expect(changed).not.toBe(first)
    })

    describe('package.artifact', () => {
      it('hashes the supplied zip and starts its entry directly', async () => {
        fs.mkdirSync(path.join(serviceDir, 'dist'))
        const artifact = path.join(serviceDir, 'dist', 'app.zip')
        await givenZip(artifact, { 'server.js': 'listen()' })

        const artifacts = await collect({
          api: { entry: './server.js', package: { artifact: 'dist/app.zip' } },
        })

        expect(artifacts.get('api')).toEqual({
          key: `serverless/shop/dev/webapps/api-${sha256(artifact)}.zip`,
          sourceFile: artifact,
          entrypoint: 'server.js',
          prebuilt: true,
        })
      })

      it('rejects a zip without the entry', async () => {
        fs.mkdirSync(path.join(serviceDir, 'dist'))
        await givenZip(path.join(serviceDir, 'dist', 'app.zip'), {
          'index.js': 'listen()',
        })

        await expect(
          collect({
            api: {
              entry: 'src/server.js',
              package: { artifact: 'dist/app.zip' },
            },
          }),
        ).rejects.toMatchObject({
          code: 'WEB_APPS_ARTIFACT_ENTRY_MISSING',
          stack: undefined,
          message:
            'webApps.api.entry "src/server.js" is not in dist/app.zip. Set entry to the path of your server\'s start file inside the zip.',
        })
      })

      it('rejects a missing file', async () => {
        await expect(
          collect({
            api: { entry: 'server.js', package: { artifact: 'dist/app.zip' } },
          }),
        ).rejects.toMatchObject({
          code: 'WEB_APPS_ARTIFACT_NOT_FOUND',
          stack: undefined,
          message:
            'webApps.api.package.artifact "dist/app.zip" does not exist.',
        })
      })

      it('rejects a file that is not a zip', async () => {
        fs.writeFileSync(path.join(serviceDir, 'app.zip'), 'not a zip')

        await expect(
          collect({
            api: { entry: 'server.js', package: { artifact: 'app.zip' } },
          }),
        ).rejects.toMatchObject({
          code: 'WEB_APPS_ARTIFACT_UNREADABLE',
          stack: undefined,
          message:
            'webApps.api.package.artifact "app.zip" is not a readable zip file.',
        })
      })
    })

    describe('package.artifact from S3', () => {
      const uri = 's3://artifacts/builds/app.zip'
      const s3App = (entry = 'server.js') => ({
        api: { entry, package: { artifact: uri } },
      })

      // getObject answering with the bytes of a zip holding `files`.
      const givenS3Zip = async (files) => {
        const zip = path.join(serviceDir, 'remote.zip')
        await givenZip(zip, files)
        const bytes = fs.readFileSync(zip)
        fs.rmSync(zip)
        return { bytes, request: jest.fn().mockResolvedValue({ Body: bytes }) }
      }

      const awsError = (code, message) =>
        Object.assign(new Error(message), {
          code: `AWS_S3_GET_OBJECT_${code.toUpperCase()}`,
          providerError: { code, message },
        })

      it('downloads the object and keys and checks it like a local zip', async () => {
        const { bytes, request } = await givenS3Zip({ 'server.js': 'listen()' })
        const sha = crypto.createHash('sha256').update(bytes).digest('hex')

        const artifacts = await collect(s3App('./server.js'), {}, { request })

        expect(request).toHaveBeenCalledWith(
          'S3',
          'getObject',
          { Bucket: 'artifacts', Key: 'builds/app.zip' },
          expect.anything(),
        )
        const artifact = artifacts.get('api')
        expect(artifact).toMatchObject({
          key: `serverless/shop/dev/webapps/api-${sha}.zip`,
          entrypoint: 'server.js',
          prebuilt: true,
        })
        expect(fs.readFileSync(artifact.sourceFile)).toEqual(bytes)

        await persistWebAppArtifacts({ packageDir, artifacts })
        expect(sha256(path.join(packageDir, 'webapps', `api-${sha}.zip`))).toBe(
          sha,
        )
      })

      it('rejects a downloaded zip without the entry', async () => {
        const { request } = await givenS3Zip({ 'index.js': 'listen()' })

        await expect(
          collect(s3App('src/server.js'), {}, { request }),
        ).rejects.toMatchObject({
          code: 'WEB_APPS_ARTIFACT_ENTRY_MISSING',
          stack: undefined,
          message: `webApps.api.entry "src/server.js" is not in ${uri}. Set entry to the path of your server's start file inside the zip.`,
        })
      })

      it.each(['NoSuchKey', 'NoSuchBucket'])(
        'rejects a missing object (%s)',
        async (code) => {
          const request = jest
            .fn()
            .mockRejectedValue(
              awsError(code, 'The specified key does not exist.'),
            )

          await expect(collect(s3App(), {}, { request })).rejects.toMatchObject(
            {
              code: 'WEB_APPS_ARTIFACT_NOT_FOUND',
              stack: undefined,
              message: `webApps.api.package.artifact "${uri}" does not exist.`,
            },
          )
        },
      )

      it('rejects an object the credentials cannot read', async () => {
        const request = jest
          .fn()
          .mockRejectedValue(awsError('AccessDenied', 'Access Denied'))

        await expect(collect(s3App(), {}, { request })).rejects.toMatchObject({
          code: 'WEB_APPS_ARTIFACT_DOWNLOAD_FAILED',
          stack: undefined,
          message: `webApps.api.package.artifact "${uri}" could not be downloaded: Access Denied. Check that the object exists and that your deploy credentials allow s3:GetObject on it.`,
        })
      })

      it('rejects any other download failure with the AWS message', async () => {
        const request = jest
          .fn()
          .mockRejectedValue(
            awsError('PermanentRedirect', 'The bucket is in another region.'),
          )

        await expect(collect(s3App(), {}, { request })).rejects.toMatchObject({
          code: 'WEB_APPS_ARTIFACT_DOWNLOAD_FAILED',
          stack: undefined,
          message: `webApps.api.package.artifact "${uri}" could not be downloaded: The bucket is in another region.`,
        })
      })

      it('passes missing credentials through', async () => {
        const error = Object.assign(
          new Error('AWS provider credentials not found.'),
          { code: 'AWS_CREDENTIALS_NOT_FOUND', providerError: {} },
        )
        const request = jest.fn().mockRejectedValue(error)

        await expect(collect(s3App(), {}, { request })).rejects.toBe(error)
      })
    })
  })

  describe('persistWebAppArtifacts', () => {
    it('moves packaged zips to their content-addressed names and lists them', async () => {
      await givenZip(packagedZip('api'), { 'src/server.js': 'v1' })
      const sha = sha256(packagedZip('api'))
      const artifacts = await collect({ api: { entry: 'src/server.js' } })

      await persistWebAppArtifacts({ packageDir, artifacts })

      expect(fs.readdirSync(path.join(packageDir, 'webapps'))).toEqual([
        `api-${sha}.zip`,
      ])
      expect(
        JSON.parse(
          fs.readFileSync(
            path.join(packageDir, 'webapps-uploads.json'),
            'utf8',
          ),
        ),
      ).toEqual([
        {
          name: 'api',
          key: `serverless/shop/dev/webapps/api-${sha}.zip`,
          file: `webapps/api-${sha}.zip`,
        },
      ])
    })

    it('copies a package.artifact zip and leaves the original', async () => {
      const artifact = path.join(serviceDir, 'app.zip')
      await givenZip(artifact, { 'server.js': 'listen()' })
      const sha = sha256(artifact)
      const artifacts = await collect({
        api: { entry: 'server.js', package: { artifact: 'app.zip' } },
      })

      await persistWebAppArtifacts({ packageDir, artifacts })

      expect(fs.existsSync(artifact)).toBe(true)
      const copy = path.join(packageDir, 'webapps', `api-${sha}.zip`)
      expect(sha256(copy)).toBe(sha)
      expect(
        JSON.parse(
          fs.readFileSync(
            path.join(packageDir, 'webapps-uploads.json'),
            'utf8',
          ),
        ),
      ).toEqual([
        {
          name: 'api',
          key: `serverless/shop/dev/webapps/api-${sha}.zip`,
          file: `webapps/api-${sha}.zip`,
        },
      ])
    })
  })
})
