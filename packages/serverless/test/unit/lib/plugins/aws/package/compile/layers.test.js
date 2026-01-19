import {
  jest,
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
} from '@jest/globals'
import path from 'path'

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
  default: {
    readFile: jest.fn(),
  },
}))

// Mock @serverless/util
jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    info: jest.fn(),
    get: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
    })),
  },
}))

// Mock get-lambda-layer-artifact-path
jest.unstable_mockModule(
  '../../../../../../../lib/plugins/aws/utils/get-lambda-layer-artifact-path.js',
  () => ({
    default: jest.fn(() => '/mock/path/to/layer.zip'),
  }),
)

const fsAsync = (await import('fs/promises')).default
const AwsCompileLayers = (
  await import('../../../../../../../lib/plugins/aws/package/compile/layers.js')
).default

describe('AwsCompileLayers', () => {
  let awsCompileLayers
  let serverless
  let awsProvider

  beforeEach(() => {
    serverless = {
      serviceDir: '/test/service',
      service: {
        service: 'my-service',
        provider: {
          name: 'aws',
          stage: 'dev',
          region: 'us-east-1',
          compiledCloudFormationTemplate: {
            Resources: {},
            Outputs: {},
          },
        },
        package: {
          artifactDirectoryName: 'serverless/my-service/dev/1234567890',
        },
        layers: {},
        getAllLayers: jest.fn(() => []),
        getLayer: jest.fn((name) => serverless.service.layers[name]),
      },
      getProvider: jest.fn(),
    }

    awsProvider = {
      naming: {
        getLambdaLayerLogicalId: jest.fn(
          (name) =>
            `${name.charAt(0).toUpperCase() + name.slice(1)}LambdaLayer`,
        ),
        getLambdaLayerPermissionLogicalId: jest.fn(
          (name, account) =>
            `${name.charAt(0).toUpperCase() + name.slice(1)}LambdaLayerPermission${account.replace(/[^a-zA-Z0-9]/g, '')}`,
        ),
        getLambdaLayerOutputLogicalId: jest.fn(
          (name) =>
            `${name.charAt(0).toUpperCase() + name.slice(1)}LambdaLayerQualifiedArn`,
        ),
        getLambdaLayerHashOutputLogicalId: jest.fn(
          (name) =>
            `${name.charAt(0).toUpperCase() + name.slice(1)}LambdaLayerHash`,
        ),
        getLambdaLayerS3KeyOutputLogicalId: jest.fn(
          (name) =>
            `${name.charAt(0).toUpperCase() + name.slice(1)}LambdaLayerS3Key`,
        ),
        getStackName: jest.fn(() => 'my-service-dev'),
      },
      serverless,
      resolveLayerArtifactName: jest.fn((name) => `${name}.zip`),
      request: jest.fn(),
    }

    serverless.getProvider = jest.fn(() => awsProvider)

    awsCompileLayers = new AwsCompileLayers(serverless, {})
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('#constructor()', () => {
    it('should set serverless instance', () => {
      expect(awsCompileLayers.serverless).toBe(serverless)
    })

    it('should set options', () => {
      const options = { stage: 'prod' }
      const layers = new AwsCompileLayers(serverless, options)
      expect(layers.options).toBe(options)
    })

    it('should set provider', () => {
      expect(awsCompileLayers.provider).toBe(awsProvider)
    })

    it('should set hooks', () => {
      expect(awsCompileLayers.hooks).toHaveProperty('package:compileLayers')
      expect(typeof awsCompileLayers.hooks['package:compileLayers']).toBe(
        'function',
      )
    })

    it('should set packagePath from service.package.path if provided', () => {
      serverless.service.package.path = '/custom/path'
      const layers = new AwsCompileLayers(serverless, {})
      expect(layers.packagePath).toBe('/custom/path')
    })

    it('should set packagePath to .serverless by default', () => {
      expect(awsCompileLayers.packagePath).toBe(
        path.join('/test/service', '.serverless'),
      )
    })
  })

  describe('#cfLambdaLayerTemplate()', () => {
    it('should return Lambda layer template structure', () => {
      const template = awsCompileLayers.cfLambdaLayerTemplate()

      expect(template.Type).toBe('AWS::Lambda::LayerVersion')
      expect(template.Properties.Content.S3Bucket).toEqual({
        Ref: 'ServerlessDeploymentBucket',
      })
      expect(template.Properties.Content.S3Key).toBe('S3Key')
      expect(template.Properties.LayerName).toBe('LayerName')
    })
  })

  describe('#cfLambdaLayerPermissionTemplate()', () => {
    it('should return Lambda layer permission template structure', () => {
      const template = awsCompileLayers.cfLambdaLayerPermissionTemplate()

      expect(template.Type).toBe('AWS::Lambda::LayerVersionPermission')
      expect(template.Properties.Action).toBe('lambda:GetLayerVersion')
      expect(template.Properties.LayerVersionArn).toBe('LayerVersionArn')
      expect(template.Properties.Principal).toBe('Principal')
    })
  })

  describe('#cfOutputLayerTemplate()', () => {
    it('should return layer output template structure', () => {
      const template = awsCompileLayers.cfOutputLayerTemplate()

      expect(template.Description).toBe('Current Lambda layer version')
      expect(template.Value).toBe('Value')
    })
  })

  describe('#cfOutputLayerHashTemplate()', () => {
    it('should return layer hash output template structure', () => {
      const template = awsCompileLayers.cfOutputLayerHashTemplate()

      expect(template.Description).toBe('Current Lambda layer hash')
      expect(template.Value).toBe('Value')
    })
  })

  describe('#cfOutputLayerS3KeyTemplate()', () => {
    it('should return layer S3 key output template structure', () => {
      const template = awsCompileLayers.cfOutputLayerS3KeyTemplate()

      expect(template.Description).toBe('Current Lambda layer S3Key')
      expect(template.Value).toBe('Value')
    })
  })

  describe('#compileLayer()', () => {
    beforeEach(() => {
      // Mock reading layer artifact
      fsAsync.readFile.mockResolvedValue(Buffer.from('mock-layer-content'))
    })

    it('should create layer version resource', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
        },
      }
      serverless.service.getAllLayers = jest.fn(() => ['testLayer'])

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(resources.TestLayerLambdaLayer).toBeDefined()
      expect(resources.TestLayerLambdaLayer.Type).toBe(
        'AWS::Lambda::LayerVersion',
      )
    })

    it('should set layer name from config', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
          name: 'custom-layer-name',
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(resources.TestLayerLambdaLayer.Properties.LayerName).toBe(
        'custom-layer-name',
      )
    })

    it('should set layer name to layer key name if not specified', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(resources.TestLayerLambdaLayer.Properties.LayerName).toBe(
        'testLayer',
      )
    })

    it('should set S3Key with artifact directory and filename', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(resources.TestLayerLambdaLayer.Properties.Content.S3Key).toBe(
        'serverless/my-service/dev/1234567890/testLayer.zip',
      )
    })

    it('should support layers[].description', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
          description: 'My test layer description',
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(resources.TestLayerLambdaLayer.Properties.Description).toBe(
        'My test layer description',
      )
    })

    it('should support layers[].licenseInfo', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
          licenseInfo: 'MIT',
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(resources.TestLayerLambdaLayer.Properties.LicenseInfo).toBe('MIT')
    })

    it('should support layers[].compatibleRuntimes', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
          compatibleRuntimes: ['nodejs18.x', 'nodejs20.x', 'nodejs22.x'],
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(
        resources.TestLayerLambdaLayer.Properties.CompatibleRuntimes,
      ).toEqual(['nodejs18.x', 'nodejs20.x', 'nodejs22.x'])
    })

    it('should support layers[].compatibleArchitectures', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
          compatibleArchitectures: ['arm64', 'x86_64'],
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(
        resources.TestLayerLambdaLayer.Properties.CompatibleArchitectures,
      ).toEqual(['arm64', 'x86_64'])
    })

    it('should support custom deployment bucket', async () => {
      serverless.service.package.deploymentBucket = 'my-custom-bucket'
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(resources.TestLayerLambdaLayer.Properties.Content.S3Bucket).toBe(
        'my-custom-bucket',
      )
    })

    it('should create layer outputs', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const outputs =
        serverless.service.provider.compiledCloudFormationTemplate.Outputs
      expect(outputs.TestLayerLambdaLayerQualifiedArn).toBeDefined()
      expect(outputs.TestLayerLambdaLayerQualifiedArn.Description).toBe(
        'Current Lambda layer version',
      )
      expect(outputs.TestLayerLambdaLayerQualifiedArn.Value).toEqual({
        Ref: 'TestLayerLambdaLayer',
      })
    })

    it('should create layer hash output', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const outputs =
        serverless.service.provider.compiledCloudFormationTemplate.Outputs
      expect(outputs.TestLayerLambdaLayerHash).toBeDefined()
      expect(outputs.TestLayerLambdaLayerHash.Description).toBe(
        'Current Lambda layer hash',
      )
      expect(typeof outputs.TestLayerLambdaLayerHash.Value).toBe('string')
    })

    it('should create layer S3Key output', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const outputs =
        serverless.service.provider.compiledCloudFormationTemplate.Outputs
      expect(outputs.TestLayerLambdaLayerS3Key).toBeDefined()
      expect(outputs.TestLayerLambdaLayerS3Key.Description).toBe(
        'Current Lambda layer S3Key',
      )
    })
  })

  describe('#compileLayer() with allowedAccounts', () => {
    beforeEach(() => {
      fsAsync.readFile.mockResolvedValue(Buffer.from('mock-layer-content'))
    })

    it('should create permission for wildcard account', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
          allowedAccounts: ['*'],
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      const permissionKey = Object.keys(resources).find((key) =>
        key.includes('Permission'),
      )
      expect(permissionKey).toBeDefined()
      expect(resources[permissionKey].Type).toBe(
        'AWS::Lambda::LayerVersionPermission',
      )
      expect(resources[permissionKey].Properties.Principal).toBe('*')
      expect(resources[permissionKey].Properties.Action).toBe(
        'lambda:GetLayerVersion',
      )
    })

    it('should create permissions for multiple accounts', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
          allowedAccounts: ['123456789012', '123456789013'],
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      const permissionKeys = Object.keys(resources).filter((key) =>
        key.includes('Permission'),
      )
      expect(permissionKeys.length).toBe(2)

      const principals = permissionKeys.map(
        (key) => resources[key].Properties.Principal,
      )
      expect(principals).toContain('123456789012')
      expect(principals).toContain('123456789013')
    })

    it('should reference layer version ARN in permission', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
          allowedAccounts: ['*'],
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      const permissionKey = Object.keys(resources).find((key) =>
        key.includes('Permission'),
      )
      expect(resources[permissionKey].Properties.LayerVersionArn).toEqual({
        Ref: 'TestLayerLambdaLayer',
      })
    })
  })

  describe('#compileLayer() with retain', () => {
    beforeEach(() => {
      fsAsync.readFile.mockResolvedValue(Buffer.from('mock-layer-content'))
    })

    it('should set DeletionPolicy to Retain on layer resource', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
          retain: true,
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      // With retain, the logical ID includes the SHA hash
      const layerKey = Object.keys(resources).find(
        (key) =>
          key.startsWith('TestLayerLambdaLayer') && !key.includes('Permission'),
      )
      expect(layerKey).toBeDefined()
      expect(layerKey).not.toBe('TestLayerLambdaLayer') // Should have hash suffix
      expect(resources[layerKey].DeletionPolicy).toBe('Retain')
    })

    it('should set DeletionPolicy to Retain on permission resource', async () => {
      serverless.service.layers = {
        testLayer: {
          path: 'layer',
          retain: true,
          allowedAccounts: ['123456789012'],
        },
      }

      await awsCompileLayers.compileLayer('testLayer')

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      const permissionKey = Object.keys(resources).find((key) =>
        key.includes('Permission'),
      )
      expect(permissionKey).toBeDefined()
      expect(resources[permissionKey].DeletionPolicy).toBe('Retain')
    })
  })

  describe('#compileLayers()', () => {
    beforeEach(() => {
      fsAsync.readFile.mockResolvedValue(Buffer.from('mock-layer-content'))
      awsProvider.request.mockRejectedValue(new Error('Stack does not exist'))
    })

    it('should compile all layers', async () => {
      serverless.service.layers = {
        layerOne: { path: 'layer1' },
        layerTwo: { path: 'layer2' },
      }
      serverless.service.getAllLayers = jest.fn(() => ['layerOne', 'layerTwo'])

      await awsCompileLayers.compileLayers()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(resources.LayerOneLambdaLayer).toBeDefined()
      expect(resources.LayerTwoLambdaLayer).toBeDefined()
    })

    it('should not create resources when no layers defined', async () => {
      serverless.service.layers = {}
      serverless.service.getAllLayers = jest.fn(() => [])

      await awsCompileLayers.compileLayers()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
      expect(Object.keys(resources).length).toBe(0)
    })
  })
})
