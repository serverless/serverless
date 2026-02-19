'use strict'

import { jest, describe, test, expect, beforeEach } from '@jest/globals'

const mockCheckDocker = jest.fn()
const mockProcessImages = jest.fn()
const mockBuildForRuntime = jest.fn()
const mockPushForRuntime = jest.fn()

jest.unstable_mockModule(
  '../../../../../../../lib/plugins/aws/bedrock-agentcore/docker/builder.js',
  () => ({
    DockerBuilder: jest.fn(() => ({
      checkDocker: mockCheckDocker,
      processImages: mockProcessImages,
      buildForRuntime: mockBuildForRuntime,
      pushForRuntime: mockPushForRuntime,
    })),
  }),
)

jest.unstable_mockModule('@serverless/util', () => ({
  progress: {
    get: () => ({
      notice: jest.fn(),
      remove: jest.fn(),
    }),
  },
}))

const { buildDockerImages, pushDockerImages } =
  await import('../../../../../../../lib/plugins/aws/bedrock-agentcore/docker/coordinator.js')

describe('docker/coordinator', () => {
  const mockLog = {
    info: jest.fn(),
    debug: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  }

  const mockServerless = {
    classes: { Error: Error },
  }

  const mockContext = {
    serviceName: 'test-service',
    stage: 'dev',
    serviceDir: '/home/user/project',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockCheckDocker.mockResolvedValue(true)
    mockBuildForRuntime.mockResolvedValue({
      imageUri: '123456.dkr.ecr.us-east-1.amazonaws.com/test:latest',
      repository: 'test',
      tag: 'latest',
    })
    mockProcessImages.mockResolvedValue({
      myImage: '123456.dkr.ecr.us-east-1.amazonaws.com/my-image:latest',
    })
  })

  describe('buildDockerImages', () => {
    test('returns early when no agents defined', async () => {
      const builtImages = {}
      const buildMetadata = []

      await buildDockerImages({
        aiConfig: {},
        ecrImages: null,
        context: mockContext,
        serverless: mockServerless,
        log: mockLog,
        builtImages,
        buildMetadata,
      })

      expect(mockCheckDocker).not.toHaveBeenCalled()
      expect(buildMetadata).toHaveLength(0)
    })

    test('returns early when aiConfig is null', async () => {
      const builtImages = {}
      const buildMetadata = []

      await buildDockerImages({
        aiConfig: null,
        ecrImages: null,
        context: mockContext,
        serverless: mockServerless,
        log: mockLog,
        builtImages,
        buildMetadata,
      })

      expect(mockCheckDocker).not.toHaveBeenCalled()
    })

    test('throws when Docker is not available', async () => {
      mockCheckDocker.mockResolvedValue(false)

      const builtImages = {}
      const buildMetadata = []

      await expect(
        buildDockerImages({
          aiConfig: {
            agents: {
              assistant: {
                artifact: { image: { path: '.' } },
              },
            },
          },
          ecrImages: null,
          context: mockContext,
          serverless: mockServerless,
          log: mockLog,
          builtImages,
          buildMetadata,
        }),
      ).rejects.toThrow('Docker is required')
    })

    test('builds image for agent with artifact.image as object', async () => {
      const builtImages = {}
      const buildMetadata = []

      await buildDockerImages({
        aiConfig: {
          agents: {
            assistant: {
              artifact: { image: { path: './docker' } },
            },
          },
        },
        ecrImages: null,
        context: mockContext,
        serverless: mockServerless,
        log: mockLog,
        builtImages,
        buildMetadata,
      })

      expect(mockBuildForRuntime).toHaveBeenCalledWith(
        'assistant',
        { path: './docker' },
        mockContext,
      )
      expect(builtImages.assistant).toBeDefined()
      expect(buildMetadata).toHaveLength(1)
      expect(buildMetadata[0].agentName).toBe('assistant')
    })

    test('auto-detects Docker build for agent without handler or image', async () => {
      const builtImages = {}
      const buildMetadata = []

      await buildDockerImages({
        aiConfig: {
          agents: {
            assistant: {
              runtime: 'python3.13',
            },
          },
        },
        ecrImages: null,
        context: mockContext,
        serverless: mockServerless,
        log: mockLog,
        builtImages,
        buildMetadata,
      })

      expect(mockBuildForRuntime).toHaveBeenCalledWith(
        'assistant',
        { path: '.' },
        mockContext,
      )
    })

    test('skips agent with handler (code deployment, not Docker)', async () => {
      const builtImages = {}
      const buildMetadata = []

      await buildDockerImages({
        aiConfig: {
          agents: {
            assistant: {
              handler: 'agents/main.py',
              runtime: 'python3.13',
            },
          },
        },
        ecrImages: null,
        context: mockContext,
        serverless: mockServerless,
        log: mockLog,
        builtImages,
        buildMetadata,
      })

      expect(mockBuildForRuntime).not.toHaveBeenCalled()
      expect(buildMetadata).toHaveLength(0)
    })

    test('skips agent with string image URI (pre-built)', async () => {
      const builtImages = {}
      const buildMetadata = []

      await buildDockerImages({
        aiConfig: {
          agents: {
            assistant: {
              artifact: {
                image: '123456.dkr.ecr.us-east-1.amazonaws.com/my-agent:v1',
              },
            },
          },
        },
        ecrImages: null,
        context: mockContext,
        serverless: mockServerless,
        log: mockLog,
        builtImages,
        buildMetadata,
      })

      expect(mockBuildForRuntime).not.toHaveBeenCalled()
    })

    test('processes provider.ecr.images', async () => {
      const builtImages = {}
      const buildMetadata = []
      const ecrImages = {
        myImage: { path: './docker' },
      }

      await buildDockerImages({
        aiConfig: { agents: {} },
        ecrImages,
        context: mockContext,
        serverless: mockServerless,
        log: mockLog,
        builtImages,
        buildMetadata,
      })

      expect(mockProcessImages).toHaveBeenCalledWith(ecrImages, mockContext)
      expect(builtImages.myImage).toBeDefined()
    })

    test('builds multiple agents', async () => {
      const builtImages = {}
      const buildMetadata = []

      await buildDockerImages({
        aiConfig: {
          agents: {
            agent1: { artifact: { image: { path: './agent1' } } },
            agent2: { artifact: { image: { path: './agent2' } } },
          },
        },
        ecrImages: null,
        context: mockContext,
        serverless: mockServerless,
        log: mockLog,
        builtImages,
        buildMetadata,
      })

      expect(mockBuildForRuntime).toHaveBeenCalledTimes(2)
      expect(buildMetadata).toHaveLength(2)
    })
  })

  describe('pushDockerImages', () => {
    test('returns early when no build metadata', async () => {
      await pushDockerImages({
        buildMetadata: [],
        serverless: mockServerless,
        log: mockLog,
      })

      expect(mockPushForRuntime).not.toHaveBeenCalled()
    })

    test('pushes all built images', async () => {
      const buildMetadata = [
        {
          agentName: 'agent1',
          imageUri: '123456.dkr.ecr.us-east-1.amazonaws.com/agent1:v1',
        },
        {
          agentName: 'agent2',
          imageUri: '123456.dkr.ecr.us-east-1.amazonaws.com/agent2:v1',
        },
      ]

      await pushDockerImages({
        buildMetadata,
        serverless: mockServerless,
        log: mockLog,
      })

      expect(mockPushForRuntime).toHaveBeenCalledTimes(2)
      expect(mockPushForRuntime).toHaveBeenCalledWith(buildMetadata[0])
      expect(mockPushForRuntime).toHaveBeenCalledWith(buildMetadata[1])
    })

    test('pushes single image', async () => {
      const buildMetadata = [
        {
          agentName: 'assistant',
          imageUri: '123456.dkr.ecr.us-east-1.amazonaws.com/assistant:v1',
          repository: 'assistant',
          tag: 'v1',
        },
      ]

      await pushDockerImages({
        buildMetadata,
        serverless: mockServerless,
        log: mockLog,
      })

      expect(mockPushForRuntime).toHaveBeenCalledTimes(1)
      expect(mockPushForRuntime).toHaveBeenCalledWith(buildMetadata[0])
    })
  })
})
