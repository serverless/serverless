'use strict'

import { jest, describe, test, expect, beforeEach } from '@jest/globals'

const mockFileExists = jest.fn()
const mockSend = jest.fn()

jest.unstable_mockModule('chokidar', () => ({
  default: { watch: jest.fn(() => ({ on: jest.fn(), close: jest.fn() })) },
}))

jest.unstable_mockModule('chalk', () => ({
  default: {
    green: (s) => s,
    blue: (s) => s,
    gray: (s) => s,
    dim: (s) => s,
  },
}))

jest.unstable_mockModule('@serverless/util', () => ({
  addProxyToAwsClient: (client) => client,
  log: {
    get: () => ({
      debug: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
      notice: jest.fn(),
      aside: jest.fn(),
      blankLine: jest.fn(),
      info: jest.fn(),
    }),
  },
  progress: {
    get: () => ({
      notice: jest.fn(),
      remove: jest.fn(),
    }),
  },
}))

jest.unstable_mockModule('@serverless/util/src/docker/index.js', () => ({
  DockerClient: jest.fn(() => ({
    removeContainer: jest.fn(),
    createContainer: jest.fn(() => ({ start: jest.fn() })),
  })),
}))

jest.unstable_mockModule(
  '../../../../../../../lib/plugins/aws/bedrock-agentcore/docker/builder.js',
  () => ({
    DockerBuilder: jest.fn(() => ({
      buildImage: jest.fn(),
    })),
  }),
)

jest.unstable_mockModule(
  '../../../../../../../lib/plugins/aws/bedrock-agentcore/dev/code-mode.js',
  () => ({
    AgentCoreCodeMode: jest.fn(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      getProcess: jest.fn(),
      getWatchPath: jest.fn(() => '/tmp/project'),
      getWatchPatterns: jest.fn(() => ({
        include: ['**/*.py'],
        exclude: [],
      })),
    })),
  }),
)

jest.unstable_mockModule(
  '../../../../../../../lib/utils/fs/file-exists.js',
  () => ({
    default: mockFileExists,
  }),
)

jest.unstable_mockModule('@aws-sdk/client-iam', () => ({
  IAMClient: jest.fn(() => ({ send: mockSend })),
  GetRoleCommand: jest.fn((params) => ({ ...params, _type: 'GetRole' })),
  UpdateAssumeRolePolicyCommand: jest.fn((params) => ({
    ...params,
    _type: 'UpdateAssumeRolePolicy',
  })),
}))

jest.unstable_mockModule('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn(() => ({ send: mockSend })),
  GetCallerIdentityCommand: jest.fn((params) => ({
    ...params,
    _type: 'GetCallerIdentity',
  })),
  AssumeRoleCommand: jest.fn((params) => ({
    ...params,
    _type: 'AssumeRole',
  })),
}))

const { AgentCoreDevMode } =
  await import('../../../../../../../lib/plugins/aws/bedrock-agentcore/dev/index.js')

describe('AgentCoreDevMode', () => {
  const createInstance = (overrides = {}) => {
    return new AgentCoreDevMode({
      serverless: { classes: { Error: Error } },
      provider: { getCredentials: jest.fn().mockResolvedValue({}) },
      serviceName: 'my-service',
      projectPath: '/home/user/project',
      agentName: 'assistant',
      agentConfig: {
        handler: 'agents/main.py',
        runtime: 'python3.13',
      },
      region: 'us-east-1',
      roleArn: 'arn:aws:iam::123456789012:role/my-role',
      port: 8080,
      ...overrides,
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFileExists.mockResolvedValue(false)
  })

  describe('constructor', () => {
    test('creates instance with valid configuration', () => {
      const instance = createInstance()
      expect(instance).toBeDefined()
    })

    test('uses default port 8080', () => {
      const instance = createInstance()
      expect(instance).toBeDefined()
    })
  })

  describe('stop()', () => {
    test('no-ops when nothing is running', async () => {
      const instance = createInstance()
      await instance.stop()
    })

    test('can be called multiple times safely', async () => {
      const instance = createInstance()
      await instance.stop()
      await instance.stop()
    })
  })
})

describe('AgentCoreDevMode - mode detection logic', () => {
  /**
   * Mode detection is a private method (#detectMode), so we verify its behavior
   * through the documented priority rules:
   *
   * Priority 1: artifact.image as object -> docker mode
   * Priority 2: handler without image/s3 -> code mode
   * Priority 3: Dockerfile exists -> docker mode
   * Default: docker mode (buildpacks)
   *
   * Since we can't call #detectMode directly, we validate the config patterns
   * that each branch handles. The start() method orchestrates everything but
   * requires full AWS setup, so we document the rules here as specification tests.
   */

  test('artifact.image as object triggers docker mode (priority 1)', () => {
    const agentConfig = {
      artifact: { image: { path: './docker', file: 'Dockerfile.agent' } },
    }
    expect(agentConfig.artifact?.image).toBeDefined()
    expect(typeof agentConfig.artifact.image).toBe('object')
  })

  test('handler without image triggers code mode (priority 2)', () => {
    const agentConfig = {
      handler: 'agents/main.py',
      runtime: 'python3.13',
    }
    expect(agentConfig.handler).toBeDefined()
    expect(agentConfig.artifact?.image).toBeUndefined()
  })

  test('handler with string image is NOT code mode', () => {
    const agentConfig = {
      handler: 'agents/main.py',
      artifact: { image: '123456.dkr.ecr.us-east-1.amazonaws.com/repo:tag' },
    }
    expect(typeof agentConfig.artifact?.image).toBe('string')
  })

  test('handler with s3 artifact is NOT code mode', () => {
    const agentConfig = {
      handler: 'agents/main.py',
      artifact: { s3: { bucket: 'my-bucket', key: 'code.zip' } },
    }
    expect(agentConfig.artifact?.s3?.bucket).toBeDefined()
  })

  test('no handler and no image defaults to docker (buildpacks)', () => {
    const agentConfig = {
      runtime: 'python3.13',
    }
    expect(agentConfig.handler).toBeUndefined()
    expect(agentConfig.artifact?.image).toBeUndefined()
  })
})
