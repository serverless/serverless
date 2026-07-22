import fs from 'fs'
import os from 'os'
import path from 'path'
import AwsCompileFunctions from '../../../../../../../lib/plugins/aws/package/compile/functions.js'
import Serverless from '../../../../../../../lib/serverless.js'
import AwsProvider from '../../../../../../../lib/plugins/aws/provider.js'
import { jest } from '@jest/globals'

describe('AwsCompileFunctions', () => {
  let serverless
  let awsCompileFunctions
  let tempDir

  beforeEach(() => {
    const options = {}
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'functions-code-storage-mode-test-'),
    )
    fs.writeFileSync(path.join(tempDir, 'service.zip'), 'dummy content')

    serverless = new Serverless({ commands: [], options: {} })
    serverless.serviceDir = tempDir
    serverless.credentialProviders = {
      aws: {
        getCredentials: jest.fn(),
      },
    }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    }
    serverless.service.package.artifact = 'service.zip'
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileFunctions = new AwsCompileFunctions(serverless, options)

    serverless.service.functions = {
      hello: {
        handler: 'index.handler',
      },
    }
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('code storage mode', () => {
    it('sets Code.S3ObjectStorageMode REFERENCE on zip functions in reference mode', async () => {
      serverless.service.provider.deploymentBucketObject = {
        codeStorageMode: 'reference',
      }
      await awsCompileFunctions.compileFunctions()
      const resource =
        awsCompileFunctions.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.HelloLambdaFunction
      expect(resource.Properties.Code.S3ObjectStorageMode).toBe('REFERENCE')
      expect(resource.Properties.Code.S3Bucket).toBeDefined()
      expect(resource.Properties.Code.S3Key).toBeDefined()
    })

    it('does not set Code.S3ObjectStorageMode in copy mode', async () => {
      serverless.service.provider.deploymentBucketObject = {
        codeStorageMode: 'copy',
      }
      await awsCompileFunctions.compileFunctions()
      const resource =
        awsCompileFunctions.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.HelloLambdaFunction
      expect(resource.Properties.Code.S3ObjectStorageMode).toBeUndefined()
    })

    it('does not set Code.S3ObjectStorageMode when option absent', async () => {
      await awsCompileFunctions.compileFunctions()
      const resource =
        awsCompileFunctions.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.HelloLambdaFunction
      expect(resource.Properties.Code.S3ObjectStorageMode).toBeUndefined()
    })

    it('does not set Code.S3ObjectStorageMode on image functions', async () => {
      serverless.service.provider.deploymentBucketObject = {
        codeStorageMode: 'reference',
      }
      serverless.service.functions.hello = {
        image: '000000000000.dkr.ecr.us-east-1.amazonaws.com/repo@sha256:abc',
      }
      await awsCompileFunctions.compileFunctions()
      const resource =
        awsCompileFunctions.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.HelloLambdaFunction
      expect(resource.Properties.Code.S3ObjectStorageMode).toBeUndefined()
      expect(resource.Properties.Code.ImageUri).toBeDefined()
    })
  })

  describe('reused-layer version digest stability', () => {
    // In reference mode the layer-reuse path pins `Content.S3ObjectVersion` on
    // the layer resource at compile time. The published Lambda Version logical
    // id (which embeds a digest of the function + layer configuration) must be
    // identical whether or not that property is present, otherwise an unchanged
    // redeploy churns the version id and never skips.
    const compileWithLayer = async ({
      withS3ObjectVersion,
      withS3ObjectStorageMode = false,
    }) => {
      const localTempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'functions-layer-digest-test-'),
      )
      fs.writeFileSync(path.join(localTempDir, 'service.zip'), 'dummy content')
      const layerArtifactPath = path.join(localTempDir, 'layer.zip')
      fs.writeFileSync(layerArtifactPath, 'layer content')

      const options = {}
      const localServerless = new Serverless({ commands: [], options: {} })
      localServerless.serviceDir = localTempDir
      localServerless.credentialProviders = {
        aws: { getCredentials: jest.fn() },
      }
      const layerContent = { S3Bucket: 'bucket', S3Key: 'layer-key' }
      if (withS3ObjectVersion) layerContent.S3ObjectVersion = 'abc123version'
      if (withS3ObjectStorageMode)
        layerContent.S3ObjectStorageMode = 'REFERENCE'
      localServerless.service.provider.compiledCloudFormationTemplate = {
        Resources: {
          TestLayerLambdaLayer: {
            Type: 'AWS::Lambda::LayerVersion',
            _serverlessLayerName: 'testLayer',
            Properties: { Content: layerContent },
          },
        },
        Outputs: {},
      }
      localServerless.service.package.artifact = 'service.zip'
      localServerless.service.provider.deploymentBucketObject = {
        codeStorageMode: 'reference',
      }
      localServerless.service.provider.versionFunctions = true
      localServerless.setProvider(
        'aws',
        new AwsProvider(localServerless, options),
      )
      localServerless.service.layers = {
        testLayer: { package: { artifact: layerArtifactPath } },
      }
      localServerless.service.functions = {
        hello: {
          handler: 'index.handler',
          layers: [{ Ref: 'TestLayerLambdaLayer' }],
        },
      }

      const compiler = new AwsCompileFunctions(localServerless, options)
      await compiler.compileFunctions()
      const resources =
        compiler.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      const versionLogicalId = Object.keys(resources).find((key) =>
        key.startsWith('HelloLambdaVersion'),
      )
      fs.rmSync(localTempDir, { recursive: true, force: true })
      return versionLogicalId
    }

    it('produces an identical Version logical id whether or not the reused layer pins Content.S3ObjectVersion', async () => {
      const withoutVersion = await compileWithLayer({
        withS3ObjectVersion: false,
      })
      const withVersion = await compileWithLayer({ withS3ObjectVersion: true })
      expect(withoutVersion).toBeDefined()
      expect(withVersion).toBeDefined()
      expect(withVersion).toBe(withoutVersion)
    })

    // Negative control for the test above: unlike `S3ObjectVersion`,
    // `Content.S3ObjectStorageMode` must NOT be excluded from the digest — a
    // genuine storage-mode change has to rotate the version so a future
    // refactor can't blindly widen the exclusion and silently swallow it.
    it('rotates the Version logical id when the reused layer pins Content.S3ObjectStorageMode', async () => {
      const withoutStorageMode = await compileWithLayer({
        withS3ObjectVersion: false,
        withS3ObjectStorageMode: false,
      })
      const withStorageMode = await compileWithLayer({
        withS3ObjectVersion: false,
        withS3ObjectStorageMode: true,
      })
      expect(withoutStorageMode).toBeDefined()
      expect(withStorageMode).toBeDefined()
      expect(withStorageMode).not.toBe(withoutStorageMode)
    })
  })

  describe('published version CodeSha256 guard', () => {
    const findVersionResource = () => {
      const resources =
        awsCompileFunctions.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      return Object.values(resources).find(
        (resource) => resource.Type === 'AWS::Lambda::Version',
      )
    }

    it('sets a real CodeSha256 on the published Version resource in reference mode', async () => {
      serverless.service.provider.deploymentBucketObject = {
        codeStorageMode: 'reference',
      }
      serverless.service.provider.versionFunctions = true
      await awsCompileFunctions.compileFunctions()
      const versionResource = findVersionResource()
      expect(versionResource).toBeDefined()
      expect(typeof versionResource.Properties.CodeSha256).toBe('string')
      expect(versionResource.Properties.CodeSha256).not.toBe('CodeSha256')
    })

    it('sets a real CodeSha256 on the published Version resource in copy mode', async () => {
      serverless.service.provider.deploymentBucketObject = {
        codeStorageMode: 'copy',
      }
      serverless.service.provider.versionFunctions = true
      await awsCompileFunctions.compileFunctions()
      const versionResource = findVersionResource()
      expect(versionResource).toBeDefined()
      expect(typeof versionResource.Properties.CodeSha256).toBe('string')
      expect(versionResource.Properties.CodeSha256).not.toBe('CodeSha256')
    })

    it('sets a real CodeSha256 on the published Version resource when option absent', async () => {
      serverless.service.provider.versionFunctions = true
      await awsCompileFunctions.compileFunctions()
      const versionResource = findVersionResource()
      expect(versionResource).toBeDefined()
      expect(typeof versionResource.Properties.CodeSha256).toBe('string')
      expect(versionResource.Properties.CodeSha256).not.toBe('CodeSha256')
    })
  })
})
