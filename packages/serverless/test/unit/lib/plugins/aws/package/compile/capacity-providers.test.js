import { jest } from '@jest/globals'
import AwsCompileCapacityProviders from '../../../../../../../lib/plugins/aws/package/compile/capacity-providers.js'
import Serverless from '../../../../../../../lib/serverless.js'
import AwsProvider from '../../../../../../../lib/plugins/aws/provider.js'

const VPC = {
  subnetIds: ['subnet-a', 'subnet-b'],
  securityGroupIds: ['sg-a'],
}

describe('AwsCompileCapacityProviders', () => {
  let serverless

  const compile = (functions, capacityProviders) => {
    serverless.service.functions = functions
    serverless.service.provider.capacityProviders = capacityProviders
    new AwsCompileCapacityProviders(serverless, {}).compileCapacityProviders()
    return serverless.service.provider.compiledCloudFormationTemplate.Resources
  }

  const gpuProvider = {
    instanceRequirements: { allowedInstanceTypes: ['g6.xlarge', 'g5.xlarge'] },
  }

  beforeEach(() => {
    serverless = new Serverless({
      commands: ['print'],
      options: {},
      serviceDir: null,
    })
    serverless.credentialProviders = { aws: { resolve: jest.fn() } }
    serverless.service = {
      service: 'svc',
      provider: {
        name: 'aws',
        stage: 'dev',
        vpc: VPC,
        compiledCloudFormationTemplate: { Resources: {}, Outputs: {} },
      },
      functions: {},
      getFunction: jest.fn((name) => serverless.service.functions[name]),
      getAllFunctions: jest.fn(() => Object.keys(serverless.service.functions)),
    }
    const provider = new AwsProvider(serverless, { stage: 'dev' })
    serverless.setProvider('aws', provider)
  })

  describe('GPU functions', () => {
    it('should compile a provider that runs only GPU functions', () => {
      const resources = compile(
        {
          infer: {
            image: 'uri',
            capacityProvider: { name: 'gpu', gpu: { memory: 24 } },
          },
        },
        { gpu: gpuProvider },
      )
      expect(
        resources.GpuLambdaCapacityProvider.Properties.InstanceRequirements,
      ).toEqual({
        AllowedInstanceTypes: ['g6.xlarge', 'g5.xlarge'],
        Architectures: ['x86_64'],
      })
    })

    it('should require GPU instance types on a provider that runs GPU functions', () => {
      expect(() =>
        compile(
          {
            infer: {
              image: 'uri',
              capacityProvider: { name: 'gpu', gpu: { memory: 24 } },
            },
          },
          { gpu: {} },
        ),
      ).toThrow(
        expect.objectContaining({
          code: 'LAMBDA_CAPACITY_PROVIDER_GPU_REQUIRES_INSTANCE_TYPES',
          message:
            'Capacity provider "gpu" runs functions with a GPU ("infer"), so it needs GPU instance types. List them in provider.capacityProviders.gpu.instanceRequirements.allowedInstanceTypes, for example [g6.xlarge, g5.xlarge].',
        }),
      )
    })

    it('should require GPU instance types on the default provider', () => {
      expect(() =>
        compile({
          infer: {
            image: 'uri',
            capacityProvider: { name: 'default', gpu: { memory: 3 } },
          },
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'LAMBDA_CAPACITY_PROVIDER_GPU_REQUIRES_INSTANCE_TYPES',
        }),
      )
    })

    it('should reject a provider that runs functions with and without a GPU', () => {
      expect(() =>
        compile(
          {
            infer: {
              image: 'uri',
              capacityProvider: { name: 'gpu', gpu: { memory: 24 } },
            },
            api: { handler: 'handler.handler', capacityProvider: 'gpu' },
          },
          { gpu: gpuProvider },
        ),
      ).toThrow(
        expect.objectContaining({
          code: 'LAMBDA_CAPACITY_PROVIDER_MIXED_GPU',
          message:
            'Capacity provider "gpu" runs functions with a GPU ("infer") and without one ("api"). A capacity provider runs either GPU or non-GPU functions: move "api" to another capacity provider, or set capacityProvider.gpu on it.',
        }),
      )
    })

    it('should not check a capacity provider the service does not define', () => {
      expect(() =>
        compile({
          infer: {
            image: 'uri',
            capacityProvider: {
              name: 'arn:aws:lambda:us-east-1:123456789012:capacity-provider:shared',
              gpu: { memory: 24 },
            },
          },
          other: {
            image: 'uri',
            capacityProvider: {
              name: { 'Fn::ImportValue': 'shared-gpu' },
              gpu: { memory: 24 },
            },
          },
        }),
      ).not.toThrow()
    })

    it('should leave providers without GPU functions alone', () => {
      expect(() =>
        compile(
          { api: { handler: 'handler.handler', capacityProvider: 'cpu' } },
          { cpu: {} },
        ),
      ).not.toThrow()
    })
  })
})
