'use strict'

import { jest } from '@jest/globals'

// Mock child_process before importing the module
const mockExecSync = jest.fn()
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
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
    test('returns true when docker is available', () => {
      mockExecSync.mockReturnValue('Docker version 24.0.0')

      const result = builder.checkDocker()

      expect(result).toBe(true)
    })

    test('returns false when docker is not available', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found: docker')
      })

      const result = builder.checkDocker()

      expect(result).toBe(false)
    })
  })

  describe('ecrLogin', () => {
    test('authenticates with ECR successfully', async () => {
      mockExecSync
        .mockReturnValueOnce('aws-ecr-password\n') // get-login-password
        .mockReturnValueOnce('') // docker login

      const result = await builder.ecrLogin('123456789012', 'us-west-2')

      expect(result).toBe('123456789012.dkr.ecr.us-west-2.amazonaws.com')
      expect(mockExecSync).toHaveBeenCalledWith(
        'aws ecr get-login-password --region us-west-2',
        expect.any(Object),
      )
      expect(mockLog.info).toHaveBeenCalledWith('Authenticating with ECR...')
      expect(mockLog.info).toHaveBeenCalledWith('ECR authentication successful')
    })

    test('throws error when ECR login fails', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Access denied')
      })

      await expect(
        builder.ecrLogin('123456789012', 'us-west-2'),
      ).rejects.toThrow('ECR login failed: Access denied')
    })
  })

  describe('ensureRepository', () => {
    test('does not create repository if it exists', async () => {
      mockExecSync.mockReturnValue('{"repositories": []}') // describe-repositories succeeds

      await builder.ensureRepository('my-repo', 'us-west-2')

      expect(mockExecSync).toHaveBeenCalledTimes(1)
      expect(mockExecSync).toHaveBeenCalledWith(
        'aws ecr describe-repositories --repository-names my-repo --region us-west-2',
        expect.any(Object),
      )
      expect(mockLog.info).toHaveBeenCalledWith('Repository exists')
    })

    test('creates repository if it does not exist', async () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('RepositoryNotFoundException')
        })
        .mockReturnValueOnce('{}') // create-repository succeeds

      await builder.ensureRepository('my-repo', 'us-west-2')

      expect(mockExecSync).toHaveBeenCalledTimes(2)
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        'aws ecr create-repository --repository-name my-repo --region us-west-2',
        expect.any(Object),
      )
      expect(mockLog.info).toHaveBeenCalledWith('Creating ECR repository...')
      expect(mockLog.info).toHaveBeenCalledWith('Repository created')
    })
  })

  describe('buildImage', () => {
    test('builds image with default options', async () => {
      mockExecSync.mockReturnValue('')

      const dockerConfig = {
        path: '.',
        file: 'Dockerfile',
      }

      await builder.buildImage(
        'my-image:latest',
        dockerConfig,
        '/path/to/service',
      )

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(
          'docker build --platform linux/arm64 -t my-image:latest',
        ),
        expect.any(Object),
      )
      expect(mockLog.info).toHaveBeenCalledWith(
        'Building Docker image: my-image:latest',
      )
      expect(mockLog.info).toHaveBeenCalledWith('Docker build complete')
    })

    test('uses linux/arm64 as default platform (AgentCore requirement)', async () => {
      mockExecSync.mockReturnValue('')

      const dockerConfig = {
        path: '.',
      }

      await builder.buildImage(
        'my-image:latest',
        dockerConfig,
        '/path/to/service',
      )

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--platform linux/arm64'),
        expect.any(Object),
      )
    })

    test('allows custom platform override', async () => {
      mockExecSync.mockReturnValue('')

      const dockerConfig = {
        path: '.',
        platform: 'linux/amd64',
      }

      await builder.buildImage(
        'my-image:latest',
        dockerConfig,
        '/path/to/service',
      )

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--platform linux/amd64'),
        expect.any(Object),
      )
    })

    test('includes build args when specified', async () => {
      mockExecSync.mockReturnValue('')

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

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--build-arg NODE_ENV="production"'),
        expect.any(Object),
      )
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--build-arg VERSION="1.0.0"'),
        expect.any(Object),
      )
    })

    test('includes cache from when specified', async () => {
      mockExecSync.mockReturnValue('')

      const dockerConfig = {
        path: '.',
        cacheFrom: ['my-image:cache', 'my-image:latest'],
      }

      await builder.buildImage(
        'my-image:latest',
        dockerConfig,
        '/path/to/service',
      )

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--cache-from my-image:cache'),
        expect.any(Object),
      )
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--cache-from my-image:latest'),
        expect.any(Object),
      )
    })

    test('includes additional build options when specified', async () => {
      mockExecSync.mockReturnValue('')

      const dockerConfig = {
        path: '.',
        buildOptions: ['--no-cache', '--pull'],
      }

      await builder.buildImage(
        'my-image:latest',
        dockerConfig,
        '/path/to/service',
      )

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--no-cache --pull'),
        expect.any(Object),
      )
    })

    test('throws error when docker build fails', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Build failed')
      })

      const dockerConfig = { path: '.' }

      await expect(
        builder.buildImage('my-image:latest', dockerConfig, '/path/to/service'),
      ).rejects.toThrow('Docker build failed: Build failed')
    })
  })

  describe('pushImage', () => {
    test('tags and pushes image to ECR', async () => {
      mockExecSync.mockReturnValue('')

      const result = await builder.pushImage(
        'my-image:latest',
        '123456789012.dkr.ecr.us-west-2.amazonaws.com',
        'my-repo',
        'v1.0.0',
      )

      expect(result).toBe(
        '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo:v1.0.0',
      )
      expect(mockExecSync).toHaveBeenCalledWith(
        'docker tag my-image:latest 123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo:v1.0.0',
        expect.any(Object),
      )
      expect(mockExecSync).toHaveBeenCalledWith(
        'docker push 123456789012.dkr.ecr.us-west-2.amazonaws.com/my-repo:v1.0.0',
        expect.any(Object),
      )
      expect(mockLog.info).toHaveBeenCalledWith('Push complete')
    })
  })

  describe('buildAndPushForRuntime', () => {
    test('builds and pushes image for runtime', async () => {
      // Mock all execSync calls for the full workflow
      mockExecSync
        .mockReturnValueOnce('{}') // ensureRepository - describe
        .mockReturnValueOnce('aws-password\n') // ecrLogin - get-login-password
        .mockReturnValueOnce('') // ecrLogin - docker login
        .mockReturnValueOnce('') // buildImage
        .mockReturnValueOnce('') // pushImage - tag
        .mockReturnValueOnce('') // pushImage - push

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
        '123456789012.dkr.ecr.us-west-2.amazonaws.com/my-service-myAgent:v1.0.0',
      )
    })

    test('uses custom repository name when specified', async () => {
      mockExecSync
        .mockReturnValueOnce('{}')
        .mockReturnValueOnce('aws-password\n')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')

      const imageConfig = {
        path: '.',
        repository: 'custom-repo',
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
        '123456789012.dkr.ecr.us-west-2.amazonaws.com/custom-repo:dev',
      )
    })

    test('uses stage as default tag', async () => {
      mockExecSync
        .mockReturnValueOnce('{}')
        .mockReturnValueOnce('aws-password\n')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')

      const imageConfig = { path: '.' }
      const context = {
        serviceName: 'my-service',
        stage: 'production',
        region: 'us-west-2',
      }

      const result = await builder.buildAndPushForRuntime(
        'myAgent',
        imageConfig,
        context,
      )

      expect(result).toContain(':production')
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
      expect(mockExecSync).not.toHaveBeenCalled()
    })

    test('builds and pushes images with path config', async () => {
      mockExecSync
        .mockReturnValueOnce('{}')
        .mockReturnValueOnce('aws-password\n')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')

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
      expect(mockExecSync).not.toHaveBeenCalled()
    })
  })
})
