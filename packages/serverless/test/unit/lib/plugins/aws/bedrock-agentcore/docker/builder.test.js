'use strict'

import { jest } from '@jest/globals'

// Mock @serverless/util before importing the module
const mockDockerClient = {
  ensureIsRunning: jest.fn(),
  buildImage: jest.fn(),
  pushImage: jest.fn(),
  generateImageUris: jest.fn(),
}

jest.unstable_mockModule('@serverless/util', () => ({
  DockerClient: jest.fn(() => mockDockerClient),
}))

// Mock @aws-sdk/client-ecr
const mockECRClient = {
  send: jest.fn(),
}

jest.unstable_mockModule('@aws-sdk/client-ecr', () => ({
  ECRClient: jest.fn(() => mockECRClient),
  GetAuthorizationTokenCommand: jest.fn(),
  DescribeRepositoriesCommand: jest.fn(),
  CreateRepositoryCommand: jest.fn(),
}))

// Import after mocking
const { DockerBuilder } =
  await import('../../../../../../../lib/plugins/aws/bedrock-agentcore/docker/builder.js')

describe('DockerBuilder', () => {
  let mockServerless
  let mockLog
  let mockProgress
  let builder

  beforeEach(() => {
    jest.clearAllMocks()

    mockServerless = {
      getProvider: jest.fn().mockReturnValue({
        getAccountId: jest.fn().mockResolvedValue('123456789012'),
        getRegion: jest.fn().mockReturnValue('us-west-2'),
        getCredentials: jest.fn().mockResolvedValue({
          credentials: {
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
          },
        }),
      }),
      serviceDir: '/path/to/service',
    }
    mockLog = {
      info: jest.fn(),
      notice: jest.fn(),
      debug: jest.fn(),
    }
    mockProgress = {}

    builder = new DockerBuilder(mockServerless, mockLog, mockProgress)
  })

  describe('constructor', () => {
    test('initializes with serverless instance', () => {
      expect(builder.serverless).toBe(mockServerless)
      expect(builder.log).toBe(mockLog)
      expect(builder.progress).toBe(mockProgress)
    })

    test('gets provider from serverless', () => {
      expect(mockServerless.getProvider).toHaveBeenCalledWith('aws')
    })

    test('creates DockerClient instance', () => {
      expect(builder.dockerClient).toBe(mockDockerClient)
    })
  })

  describe('getRegion', () => {
    test('returns region from provider', () => {
      const region = builder.getRegion()
      expect(region).toBe('us-west-2')
    })
  })

  describe('getAccountId', () => {
    test('returns account ID from provider', async () => {
      const accountId = await builder.getAccountId()
      expect(accountId).toBe('123456789012')
    })
  })

  describe('checkDocker', () => {
    test('returns true when docker is available', async () => {
      mockDockerClient.ensureIsRunning.mockResolvedValue(undefined)

      const result = await builder.checkDocker()

      expect(result).toBe(true)
      expect(mockDockerClient.ensureIsRunning).toHaveBeenCalled()
    })

    test('returns false when docker is not available', async () => {
      mockDockerClient.ensureIsRunning.mockRejectedValue(
        new Error('Docker not running'),
      )

      const result = await builder.checkDocker()

      expect(result).toBe(false)
    })
  })

  describe('getEcrAuthToken', () => {
    test('returns auth token from ECR', async () => {
      const encodedAuth = Buffer.from('AWS:test-password').toString('base64')
      mockECRClient.send.mockResolvedValue({
        authorizationData: [
          {
            authorizationToken: encodedAuth,
            proxyEndpoint:
              'https://123456789012.dkr.ecr.us-west-2.amazonaws.com',
          },
        ],
      })

      const result = await builder.getEcrAuthToken()

      expect(result).toEqual({
        username: 'AWS',
        password: 'test-password',
        serveraddress: 'https://123456789012.dkr.ecr.us-west-2.amazonaws.com',
      })
    })

    test('throws error when no authorization data', async () => {
      mockECRClient.send.mockResolvedValue({
        authorizationData: null,
      })

      await expect(builder.getEcrAuthToken()).rejects.toThrow(
        'Failed to get authorization data from ECR',
      )
    })
  })

  describe('ensureRepository', () => {
    test('returns existing repository URI if it exists', async () => {
      mockECRClient.send.mockResolvedValue({
        repositories: [
          {
            repositoryUri:
              '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo',
          },
        ],
      })

      const result = await builder.ensureRepository('my-repo')

      expect(result).toBe(
        '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo',
      )
      expect(mockLog.info).toHaveBeenCalledWith(
        'Checking ECR repository: my-repo',
      )
    })

    test('creates repository if it does not exist', async () => {
      const notFoundError = new Error('Repository not found')
      notFoundError.name = 'RepositoryNotFoundException'

      mockECRClient.send
        .mockRejectedValueOnce(notFoundError) // describe fails
        .mockResolvedValueOnce({
          repository: {
            repositoryUri:
              '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo',
          },
        }) // create succeeds

      const result = await builder.ensureRepository('my-repo')

      expect(result).toBe(
        '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo',
      )
      expect(mockLog.info).toHaveBeenCalledWith(
        'Creating ECR repository: my-repo',
      )
    })

    test('throws error for non-NotFound errors', async () => {
      const accessError = new Error('Access denied')
      accessError.name = 'AccessDeniedException'

      mockECRClient.send.mockRejectedValue(accessError)

      await expect(builder.ensureRepository('my-repo')).rejects.toThrow(
        'Access denied',
      )
    })
  })

  describe('buildImage', () => {
    test('builds image with default options', async () => {
      mockDockerClient.buildImage.mockResolvedValue(undefined)

      const dockerConfig = {
        path: '.',
        file: 'Dockerfile',
      }

      await builder.buildImage(
        'my-image:latest',
        dockerConfig,
        '/path/to/service',
      )

      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUri: 'my-image:latest',
          containerPath: '/path/to/service',
          platform: 'linux/arm64',
        }),
      )
      expect(mockLog.info).toHaveBeenCalledWith(
        'Building Docker image: my-image:latest',
      )
      expect(mockLog.info).toHaveBeenCalledWith('Docker build complete')
    })

    test('uses linux/arm64 as default platform (AgentCore requirement)', async () => {
      mockDockerClient.buildImage.mockResolvedValue(undefined)

      const dockerConfig = {
        path: '.',
      }

      await builder.buildImage(
        'my-image:latest',
        dockerConfig,
        '/path/to/service',
      )

      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'linux/arm64',
        }),
      )
    })

    test('allows custom platform override', async () => {
      mockDockerClient.buildImage.mockResolvedValue(undefined)

      const dockerConfig = {
        path: '.',
        platform: 'linux/amd64',
      }

      await builder.buildImage(
        'my-image:latest',
        dockerConfig,
        '/path/to/service',
      )

      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'linux/amd64',
        }),
      )
    })

    test('includes build args when specified', async () => {
      mockDockerClient.buildImage.mockResolvedValue(undefined)

      const dockerConfig = {
        path: '.',
        buildArgs: {
          NODE_ENV: 'production',
          VERSION: '1.0.0',
        },
      }

      await builder.buildImage(
        'my-image:latest',
        dockerConfig,
        '/path/to/service',
      )

      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildArgs: {
            NODE_ENV: 'production',
            VERSION: '1.0.0',
          },
        }),
      )
    })

    test('includes cache from when specified', async () => {
      mockDockerClient.buildImage.mockResolvedValue(undefined)

      const dockerConfig = {
        path: '.',
        cacheFrom: ['my-image:cache', 'my-image:latest'],
      }

      await builder.buildImage(
        'my-image:latest',
        dockerConfig,
        '/path/to/service',
      )

      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildOptions: expect.arrayContaining([
            '--cache-from',
            'my-image:cache',
            '--cache-from',
            'my-image:latest',
          ]),
        }),
      )
    })
  })

  describe('pushImage', () => {
    test('pushes image to ECR', async () => {
      const encodedAuth = Buffer.from('AWS:test-password').toString('base64')
      mockECRClient.send.mockResolvedValue({
        authorizationData: [
          {
            authorizationToken: encodedAuth,
            proxyEndpoint:
              'https://123456789012.dkr.ecr.us-west-2.amazonaws.com',
          },
        ],
      })
      mockDockerClient.pushImage.mockResolvedValue(undefined)

      const result = await builder.pushImage(
        '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo:v1.0.0',
      )

      expect(result).toBe(
        '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo:v1.0.0',
      )
      expect(mockDockerClient.pushImage).toHaveBeenCalledWith({
        imageUri: '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo:v1.0.0',
        authconfig: expect.objectContaining({
          username: 'AWS',
          password: 'test-password',
        }),
      })
      expect(mockLog.info).toHaveBeenCalledWith('Push complete')
    })
  })

  describe('buildForRuntime', () => {
    test('builds image for runtime without pushing', async () => {
      mockDockerClient.generateImageUris.mockReturnValue({
        imageUri:
          '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-service-myagent:dev-abc123',
      })
      mockDockerClient.buildImage.mockResolvedValue(undefined)

      const imageConfig = {
        path: '.',
      }
      const context = {
        serviceName: 'my-service',
        stage: 'dev',
        region: 'us-west-2',
      }

      const result = await builder.buildForRuntime(
        'myAgent',
        imageConfig,
        context,
      )

      expect(result).toEqual({
        imageUri:
          '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-service-myagent:dev-abc123',
        repositoryName: 'my-service-myagent',
        imageConfig,
      })
      expect(mockDockerClient.buildImage).toHaveBeenCalled()
    })

    test('uses custom repository name when specified', async () => {
      mockDockerClient.generateImageUris.mockReturnValue({
        imageUri:
          '123456789012.dkr.ecr.us-west-2.amazonaws.com/custom-repo:dev-abc123',
      })
      mockDockerClient.buildImage.mockResolvedValue(undefined)

      const imageConfig = {
        path: '.',
        repository: 'custom-repo',
      }
      const context = {
        serviceName: 'my-service',
        stage: 'dev',
        region: 'us-west-2',
      }

      const result = await builder.buildForRuntime(
        'myAgent',
        imageConfig,
        context,
      )

      expect(result.repositoryName).toBe('custom-repo')
    })
  })

  describe('pushForRuntime', () => {
    test('pushes previously built image to ECR', async () => {
      mockECRClient.send
        .mockResolvedValueOnce({
          repositories: [
            {
              repositoryUri:
                '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo',
            },
          ],
        })
        .mockResolvedValueOnce({
          authorizationData: [
            {
              authorizationToken:
                Buffer.from('AWS:test-password').toString('base64'),
              proxyEndpoint:
                'https://123456789012.dkr.ecr.us-west-2.amazonaws.com',
            },
          ],
        })
      mockDockerClient.pushImage.mockResolvedValue(undefined)

      const buildMetadata = {
        imageUri: '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo:v1.0.0',
        repositoryName: 'my-repo',
        imageConfig: { path: '.' },
      }

      const result = await builder.pushForRuntime(buildMetadata)

      expect(result).toBe(
        '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo:v1.0.0',
      )
    })
  })

  describe('buildAndPushForRuntime', () => {
    test('builds and pushes image for runtime', async () => {
      mockDockerClient.generateImageUris.mockReturnValue({
        imageUri:
          '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-service-myagent:v1.0.0',
      })
      mockDockerClient.buildImage.mockResolvedValue(undefined)
      mockECRClient.send
        .mockResolvedValueOnce({
          repositories: [
            {
              repositoryUri:
                '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-service-myagent',
            },
          ],
        })
        .mockResolvedValueOnce({
          authorizationData: [
            {
              authorizationToken:
                Buffer.from('AWS:test-password').toString('base64'),
              proxyEndpoint:
                'https://123456789012.dkr.ecr.us-west-2.amazonaws.com',
            },
          ],
        })
      mockDockerClient.pushImage.mockResolvedValue(undefined)

      const imageConfig = {
        path: '.',
        tag: 'v1.0.0',
      }
      const context = {
        serviceName: 'my-service',
        stage: 'dev',
        region: 'us-west-2',
      }

      const result = await builder.buildAndPushForRuntime(
        'myAgent',
        imageConfig,
        context,
      )

      expect(result).toBe(
        '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-service-myagent:v1.0.0',
      )
    })
  })

  describe('processImages', () => {
    test('returns existing URI if already specified', async () => {
      const imagesConfig = {
        myImage: {
          uri: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-image:latest',
        },
      }
      const context = {
        serviceName: 'my-service',
        stage: 'dev',
        region: 'us-west-2',
      }

      const result = await builder.processImages(imagesConfig, context)

      expect(result.myImage).toBe(
        '123456789.dkr.ecr.us-west-2.amazonaws.com/my-image:latest',
      )
      expect(mockDockerClient.buildImage).not.toHaveBeenCalled()
    })

    test('builds and pushes images with path config', async () => {
      mockDockerClient.generateImageUris.mockReturnValue({
        imageUri:
          '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-service-myimage:dev',
      })
      mockDockerClient.buildImage.mockResolvedValue(undefined)
      mockECRClient.send
        .mockResolvedValueOnce({
          repositories: [
            {
              repositoryUri:
                '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-service-myimage',
            },
          ],
        })
        .mockResolvedValueOnce({
          authorizationData: [
            {
              authorizationToken:
                Buffer.from('AWS:test-password').toString('base64'),
              proxyEndpoint:
                'https://123456789012.dkr.ecr.us-west-2.amazonaws.com',
            },
          ],
        })
      mockDockerClient.pushImage.mockResolvedValue(undefined)

      const imagesConfig = {
        myImage: {
          path: './docker',
        },
      }
      const context = {
        serviceName: 'my-service',
        stage: 'dev',
        region: 'us-west-2',
      }

      const result = await builder.processImages(imagesConfig, context)

      expect(result.myImage).toContain('dkr.ecr')
    })

    test('skips images without path or uri', async () => {
      const imagesConfig = {
        myImage: {
          file: 'Dockerfile.custom',
        },
      }
      const context = {
        serviceName: 'my-service',
        stage: 'dev',
        region: 'us-west-2',
      }

      const result = await builder.processImages(imagesConfig, context)

      expect(result.myImage).toBeUndefined()
      expect(mockDockerClient.buildImage).not.toHaveBeenCalled()
    })
  })
})
